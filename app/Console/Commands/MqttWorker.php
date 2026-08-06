<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;
use App\Events\DevicePositionUpdated;
use App\Events\DeviceAlertReceived;
use App\Events\DeviceSensorUpdated;
use App\Events\DriverCheckedIn;
use App\Models\AlertFileUpload;
use App\Models\Driver;
use App\Models\DriverCheckin;
use App\Models\DriverFace;
use App\Mail\FuelAlertMail;
use App\Models\FaceRecognitionEvent;
use App\Models\FuelAbnormalLossEvent;
use App\Models\FuelAlert;
use App\Models\FuelIdleEvent;
use App\Models\FuelRefuelEvent;
use App\Models\AlertRecipient;
use App\Services\DriverRecognizedAlertService;
use App\Services\GeofenceMonitorService;
use App\Services\TurboHiveService;
use App\Services\UnregisteredDriverAlertService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Mail;

class MqttWorker extends Command
{
    protected $signature   = 'mqtt:worker';
    protected $description = 'Listen to TurboHive MQTT and broadcast device positions to frontend';

    /** Reset to the minimum after any connection that survives long enough to be considered
     *  "healthy", so a brief blip doesn't leave future reconnects waiting on a stale long delay. */
    private const MIN_BACKOFF_SECONDS = 3;
    private const MAX_BACKOFF_SECONDS = 60;
    private const HEALTHY_AFTER_SECONDS = 30;

    /** Same rule the old on-demand Refuelling report used (see ReportPage.jsx's
     *  REFUEL_RISE_THRESHOLD) — a level rise of at least this many percentage points between two
     *  consecutive readings for the same device is treated as a refuel. */
    private const REFUEL_RISE_THRESHOLD = 5;

    /** Same rule the old on-demand Abnormal Loss report used — a level drop of at least this many
     *  percentage points between two consecutive readings, with under ABNORMAL_DROP_MAX_KM
     *  travelled in between, is flagged as an abnormal loss (leak/siphon) rather than normal
     *  consumption while driving. */
    private const ABNORMAL_DROP_THRESHOLD = 8;
    private const ABNORMAL_DROP_MAX_KM = 1;

    /** Same rule the old on-demand Idle Fuel report used — a live speed reading at or under this
     *  is treated as idling (engine running, not really moving). */
    private const IDLE_SPEED_KMH = 5;

    /** An idle run shorter than this is treated as sensor noise (one stray low-speed reading)
     *  rather than a real idle period worth a row — mirrors the old report's "run.length >= 2
     *  points" guard, expressed as a minimum duration since the live stream has no fixed point
     *  cadence to count. */
    private const MIN_IDLE_DURATION_SECONDS = 60;

    /** Last known {fuelLevel, odometer} reading per IMEI, so a change can be detected between
     *  consecutive readings — in-memory only (reset on worker restart), since there's no reliable
     *  prior reading to seed from without re-querying TurboHive's OBD history. Missing at most one
     *  comparison per restart is an acceptable trade-off for not adding a startup dependency. */
    private array $lastFuelLevelByImei = [];
    private array $lastOdometerByImei = [];

    /** In-progress idle run per IMEI: ['startTime' => Carbon, 'startFuelTotal' => ?float]. An
     *  in-progress run at the moment the worker restarts is lost (never closed/saved) — same
     *  class of trade-off as the last-known-reading caches above. */
    private array $idleRunByImei = [];

    /** TurboHive fuel-sensor alert.codes persisted to fuel_alerts — see
     *  DeviceAlertReceived::KNOWN_CODE_NAMES for what each one means. */
    private const FUEL_ALERT_CODES = ['1222', '1223', '1224', '1225'];

    /** Subset of FUEL_ALERT_CODES worth emailing alert_recipients about — Low Fuel (1222, routine)
     *  and Fuel Level Increased (1224, a refuel, not a problem) are deliberately excluded; only an
     *  abnormal level (1223) or an unexpected drop (1225) is worth paging someone for. */
    private const FUEL_LOSS_ALERT_CODES = ['1223', '1225'];

    /** Resolved device names by IMEI, kept for the lifetime of this instance — same
     *  reasoning/pattern as GeofenceMonitorService's own cache. */
    private array $deviceNameCache = [];

    /**
     * php-mqtt/client's own setReconnectAutomatically() only covers transport-level resends, not
     * every failure mode — a broken socket during publish/loop (DataTransferException) is thrown
     * all the way up and previously killed this whole command, silently ending live position/
     * alert/sensor broadcasting until someone noticed and reran `artisan mqtt:worker` by hand.
     * This wraps the entire connect+subscribe+loop cycle in a retry loop with backoff, so the
     * command itself never exits on a connection failure — only Ctrl+C / process kill stops it.
     */
    public function handle(GeofenceMonitorService $geofenceMonitor, UnregisteredDriverAlertService $unregisteredDriverAlert, DriverRecognizedAlertService $driverRecognizedAlert, TurboHiveService $turboHive): void
    {
        $cfg    = config('services.turbohive_mqtt');
        $userId = $cfg['user_id'];
        $backoff = self::MIN_BACKOFF_SECONDS;

        while (true) {
            $connectedAt = microtime(true);

            try {
                $this->connectAndListen($cfg, $userId, $geofenceMonitor, $unregisteredDriverAlert, $driverRecognizedAlert, $turboHive);
            } catch (\Throwable $e) {
                $this->error("MQTT worker connection lost: {$e->getMessage()}");
                Log::warning('mqtt:worker connection lost, will reconnect', [
                    'error' => $e->getMessage(),
                ]);
            }

            $backoff = (microtime(true) - $connectedAt) >= self::HEALTHY_AFTER_SECONDS
                ? self::MIN_BACKOFF_SECONDS
                : min($backoff * 2, self::MAX_BACKOFF_SECONDS);

            $this->warn("Reconnecting in {$backoff}s…");
            sleep($backoff);
        }
    }

    /** @throws \Throwable on any connection/subscribe/loop failure — caller retries. */
    private function connectAndListen(array $cfg, string $userId, GeofenceMonitorService $geofenceMonitor, UnregisteredDriverAlertService $unregisteredDriverAlert, DriverRecognizedAlertService $driverRecognizedAlert, TurboHiveService $turboHive): void
    {
        $this->info("Connecting to {$cfg['host']}:{$cfg['port']} as {$cfg['username']}…");

        $mqtt = new MqttClient($cfg['host'], (int) $cfg['port'], $cfg['client_id']);

        $settings = (new ConnectionSettings)
            ->setUsername($cfg['username'])
            ->setPassword($cfg['password'])
            ->setKeepAliveInterval(60)
            ->setReconnectAutomatically(true);

        // false = persistent session (required when using auto-reconnect)
        $mqtt->connect($settings, false);

        $this->info('MQTT connected. Listening for device data…');

        // All device locations: {userId}/location/gnss/{imei}
        $mqtt->subscribe("{$userId}/location/gnss/#", function (string $topic, string $message) use ($geofenceMonitor) {
            $data = json_decode($message, true);
            if (!$data) return;

            $imei = $this->extractImei($topic);
            $event = new DevicePositionUpdated($imei, $data);
            broadcast($event);

            $payload = $event->broadcastWith();
            $lat = $payload['lat'];
            $lng = $payload['lng'];
            $this->line("[position] {$imei} → " . ($lat ?? '?') . ', ' . ($lng ?? '?'));

            if ($lat !== null && $lng !== null) {
                foreach ($geofenceMonitor->checkPosition($imei, (float) $lat, (float) $lng) as $geofenceEvent) {
                    $this->line("[geofence] {$imei} → {$geofenceEvent->type} \"{$geofenceEvent->geofence->name}\"");
                }
            }
        });

        // All device alerts: {userId}/alert/{imei}. Also where a JC171 AFIF face check surfaces —
        // alert.code 1824 (no match) and 1823 (match), both confirmed live 2026-07-16 — see
        // services.turbohive.face_unrecognized_alert_code/face_recognized_alert_code's docblocks.
        $faceAlertCode      = config('services.turbohive.face_unrecognized_alert_code');
        $faceRecognizedCode = config('services.turbohive.face_recognized_alert_code');
        $mqtt->subscribe("{$userId}/alert/#", function (string $topic, string $message) use ($unregisteredDriverAlert, $driverRecognizedAlert, $faceAlertCode, $faceRecognizedCode, $turboHive) {
            $data = json_decode($message, true);
            if (!$data) return;

            $imei = $this->extractImei($topic);
            $event = new DeviceAlertReceived($imei, $data);
            broadcast($event);

            $alert = $event->broadcastWith();
            $this->line("[alert]    {$imei} → " . ($alert['type'] ?? 'unknown'));

            if ($faceAlertCode !== null && $faceAlertCode !== '' && (string) $alert['code'] === (string) $faceAlertCode) {
                $unregisteredDriverAlert->handle($imei, 'Face recognition — no match', 'face');
                $this->recordFaceRecognitionEvent($imei, $data, 'failed');
            }

            if ($faceRecognizedCode !== null && $faceRecognizedCode !== '' && (string) $alert['code'] === (string) $faceRecognizedCode) {
                $driverRecognizedAlert->handle($imei);
                $this->recordFaceRecognitionEvent($imei, $data, 'succeeded');
            }

            $this->requestAlertFileUpload($turboHive, $imei, $data);
            $this->recordFuelAlert($turboHive, $imei, $alert);
        });

        // OBD/sensor readings (fuel level, etc). TurboHive's MQTT panel offers a "sensor" message
        // type, but "obd" is also a plausible topic (mirrors the REST API's OBD tag) — subscribe
        // to both since an unused subscription is harmless and we don't have documentation
        // confirming which one the real device actually publishes to.
        $sensorHandler = function (string $topic, string $message) {
            $data = json_decode($message, true);
            if (!$data) return;

            $imei = $this->extractImei($topic);
            $event = new DeviceSensorUpdated($imei, $data);
            broadcast($event);

            $payload = $event->broadcastWith();
            $fuel = $payload['fuelLevel'];
            $this->line("[sensor]   {$imei} ({$topic}) → fuel=" . ($fuel ?? '?'));

            $odometer = $payload['odometer'] ?? null;
            $this->handleFuelReading(
                $imei,
                $fuel !== null ? (float) $fuel : null,
                $odometer !== null ? (float) $odometer : null,
            );

            $speed = $payload['speed'] ?? null;
            $totalFuel = $payload['totalFuelConsumption'] ?? null;
            $this->detectIdleFuel(
                $imei,
                $speed !== null ? (float) $speed : null,
                $totalFuel !== null ? (float) $totalFuel : null,
            );
        };
        $mqtt->subscribe("{$userId}/sensor/#", $sensorHandler);
        $mqtt->subscribe("{$userId}/obd/#", $sensorHandler);

        // Card reader (RFID/iButton) check-ins. TurboHive has no REST history endpoint for this —
        // only this live "Unified Peripherals" push (messageType "dlt") — so this is the only
        // place check-ins are ever captured; see the driver_checkins migration's docblock.
        $mqtt->subscribe("{$userId}/peri/#", function (string $topic, string $message) use ($unregisteredDriverAlert) {
            $data = json_decode($message, true);
            if (!$data) return;

            $msgType = $data['messageType'] ?? $data['msgType'] ?? $data['type'] ?? null;
            if ($msgType !== 'dlt') return;

            $imei = $this->extractImei($topic);
            $cardId = $data['driver.license'] ?? $data['driverLicense'] ?? $data['license']
                ?? $data['driver.cardId'] ?? $data['cardId'] ?? null;
            if (!$cardId) return;

            $deviceTimeMs = $data['device.time'] ?? $data['deviceTime'] ?? $data['time'] ?? null;

            $driver = Driver::where('rfid_card_no', $cardId)
                ->orWhere('ibutton_no', $cardId)
                ->first();

            $checkin = DriverCheckin::create([
                'imei'           => $imei,
                'driver_card_id' => $cardId,
                'driver_id'      => $driver?->id,
                'checkin_time'   => $deviceTimeMs ? Carbon::createFromTimestampMs($deviceTimeMs) : now(),
                'server_time'    => now(),
                'latitude'       => $data['gnss.lat'] ?? $data['latitude'] ?? $data['lat'] ?? null,
                'longitude'      => $data['gnss.lng'] ?? $data['longitude'] ?? $data['lng'] ?? null,
            ]);

            if (!$driver) {
                $unregisteredDriverAlert->handle($imei, $cardId, 'rfid');
            }

            broadcast(new DriverCheckedIn($checkin));

            $this->line("[checkin]  {$imei} → card {$cardId}" . ($driver ? " ({$driver->name})" : ' (unrecognized card)'));
        });

        // Upload-result confirmation for requestAlertFileUpload()'s UPLOADFILE command (see
        // AlertFileUpload's migration docblock for the full round-trip). Only "captureUploadCompleted"
        // is documented, but the event-name field isn't checked strictly — any payload carrying
        // upload.fileList is treated as a result, since a differently-named event with the same
        // shape would otherwise be silently dropped.
        $mqtt->subscribe("{$userId}/notify/#", function (string $topic, string $message) {
            $imei = $this->extractImei($topic);
            $data = json_decode($message, true);

            if (!$data) {
                $this->line("[notify]   {$imei} → unparseable payload: " . substr($message, 0, 200));
                Log::info('Unparseable notify/# payload', ['imei' => $imei, 'raw' => $message]);
                return;
            }

            $fileList = $data['upload.fileList'] ?? $data['uploadFileList'] ?? null;
            if (is_array($fileList)) {
                $this->recordUploadResult($imei, $data, $fileList);
                return;
            }

            // EVENTSET,FACE,SHOT enrollment result (DriverFaceController::enroll()) — same notify/#
            // topic, distinguished by carrying resultCode/cmdNo instead of upload.fileList.
            if (isset($data['resultCode']) && isset($data['cmdNo'])) {
                $this->recordFaceShotResult($imei, $data);
                return;
            }

            // Logged rather than silently dropped — if TurboHive is sending something back in a
            // shape neither branch above recognizes, this is the only way to see it and adjust the
            // parsing.
            $this->line("[notify]   {$imei} → unrecognized shape: " . substr($message, 0, 200));
            Log::info('Unrecognized notify/# payload', ['imei' => $imei, 'raw' => $data]);
        });

        $mqtt->loop(true);
    }

    /**
     * alert.codes worth requesting evidence for via UPLOADFILE — driving-behavior and DMS/ADAS
     * events (speeding/harsh-driving, fatigue/distraction) confirmed against TurboHive's alert
     * catalog. Face-recognition codes (1822-1825) are deliberately excluded — those drive the
     * relay disconnect/reconnect path (UnregisteredDriverAlertService / DriverRecognizedAlertService)
     * and don't need evidence upload. Alerts outside this list are still broadcast live and logged
     * as usual; only the UPLOADFILE request (and the AlertFileUpload tracking row) is skipped for
     * them, so evidence traffic stays scoped to alerts where photo/video is actually useful.
     */
    private const ALERT_FILE_UPLOAD_CODES = [
        '1301', '1302', '1303', '1304', '1305', '1306', '1307', '1308', '1309', // speeding/harsh driving
        '1801', '1802', '1803', '1804', '1805', '1806', '1807', '1808', '1809', '1810', // DMS: fatigue, phone, smoking, etc.
        '1811', '1812', '1813', '1814', '1815', '1816', '1817', '1818', '1819', '1820', '1821', // DMS: capture/calibration/behavior
    ];

    /**
     * Builds and sends the UPLOADFILE command for an alert's evidence files (if any), and records
     * the request so the later {userId}/notify/{imei} confirmation has something to match against.
     * alert.file is only present on alerts that actually captured evidence — most alerts have none
     * — and only alert.codes in ALERT_FILE_UPLOAD_CODES are requested at all.
     */
    private function requestAlertFileUpload(TurboHiveService $turboHive, string $imei, array $data): void
    {
        $alertCode = (string) ($data['alert.code'] ?? $data['alertCode'] ?? '');
        if (!in_array($alertCode, self::ALERT_FILE_UPLOAD_CODES, true)) return;

        $rawFiles = $data['alert.file'] ?? $data['alertFile'] ?? null;
        if (!$rawFiles) return;

        $fileNames = array_values(array_filter(array_map('trim', explode(',', $rawFiles))));
        if (empty($fileNames)) return;

        $alertTimeMs = $data['alert.time'] ?? $data['alertTime'] ?? $data['device.time'] ?? null;
        $alertType   = (int) ($data['alert.type'] ?? $data['alertType'] ?? 0);
        $lng         = (float) ($data['gnss.lng'] ?? $data['longitude'] ?? 0);
        $lat         = (float) ($data['gnss.lat'] ?? $data['latitude'] ?? 0);

        try {
            $result = $turboHive->requestAlertFileUpload(
                $imei,
                $fileNames,
                $alertTimeMs ? intdiv((int) $alertTimeMs, 1000) : now()->timestamp,
                $alertType,
                $lng,
                $lat,
            );

            AlertFileUpload::create([
                'imei'         => $imei,
                'alert_type'   => $alertType,
                'alert_code'   => $alertCode,
                'alert_time'   => $alertTimeMs ? Carbon::createFromTimestampMs((int) $alertTimeMs) : now(),
                'file_names'   => $fileNames,
                'longitude'    => $lng,
                'latitude'     => $lat,
                'status'       => 'requested',
                'cmd_no'       => $result['data']['cmdNo'] ?? $result['data']['cmd_no'] ?? null,
                'requested_at' => now(),
            ]);

            $this->line("[upload]   {$imei} → requested " . count($fileNames) . ' file(s)');
        } catch (\Throwable $e) {
            Log::warning('Failed to request alert file upload', ['imei' => $imei, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Matches a notify/# upload result back to its requested row by IMEI + overlapping file names
     * (TurboHive's cmd.no isn't confirmed to correspond to anything captured at request time, so
     * it's stored for reference but not relied on for matching). Falls back to a standalone row if
     * no pending request matches, so a result is never silently dropped.
     */
    private function recordUploadResult(string $imei, array $data, array $fileList): void
    {
        $result = $data['upload.result'] ?? $data['uploadResult'] ?? null;
        $status = $result === 'success' ? 'uploaded' : 'failed';

        $attributes = [
            'status'              => $status,
            'uploaded_file_list'  => $fileList,
            'uploaded_file_path'  => $data['upload.filePath'] ?? $data['uploadFilePath'] ?? null,
            'uploaded_file_size'  => $data['upload.fileSize'] ?? $data['uploadFileSize'] ?? null,
            'upload_result'       => $result,
            'cmd_no'              => $data['cmd.no'] ?? $data['cmdNo'] ?? null,
            'uploaded_at'         => now(),
        ];

        $pending = AlertFileUpload::where('imei', $imei)
            ->where('status', 'requested')
            ->orderByDesc('requested_at')
            ->get()
            ->first(fn (AlertFileUpload $r) => count(array_intersect($r->file_names ?? [], $fileList)) > 0);

        if ($pending) {
            $pending->update($attributes);
        } else {
            AlertFileUpload::create(array_merge($attributes, [
                'imei'       => $imei,
                'file_names' => $fileList,
            ]));
        }

        $this->line("[upload]   {$imei} → {$status} (" . count($fileList) . ' file(s))');
    }

    /**
     * Result of an EVENTSET,FACE,SHOT enrollment command (DriverFaceController::enroll()).
     * TurboHive's immediate POST /v3/command/send response only confirms the command was queued
     * (code=1000) — the device's actual capture attempt reports back here. Observed shapes:
     *   success: {"resultCode":"100","cmdNo":"...","content":"SHOT OK! 22222-Jerome"}
     *   failure: {"resultCode":"100","cmdNo":"...","content":"Set failed!"}
     *            {"resultCode":"100","cmdNo":"...","content":"SHOT FAIL!Face recognition"}
     *            {"resultCode":"100","cmdNo":"...","content":"EVENTSET_FACE Error: DMS AI DISCONNECTED!"}
     *            {"resultCode":"600","cmdNo":"...","resultMsg":"request timeout"}
     * resultCode "100" isn't itself success/failure — it's just "the device responded" — so the
     * only reliable success signal is content starting with "SHOT OK". Matched back to the
     * requesting row by cmd_no; falls back to the most recent pending row for the IMEI if cmd_no
     * doesn't match anything (mirrors recordUploadResult()'s fallback), so a result is never
     * silently dropped.
     */
    private function recordFaceShotResult(string $imei, array $data): void
    {
        $cmdNo   = (string) $data['cmdNo'];
        $content = (string) ($data['content'] ?? $data['resultMsg'] ?? '');
        $ok      = (string) $data['resultCode'] === '100' && str_starts_with($content, 'SHOT OK');

        $face = DriverFace::where('imei', $imei)->where('cmd_no', $cmdNo)->first()
            ?? DriverFace::where('imei', $imei)->where('status', 'pending')->orderByDesc('requested_at')->first();

        if (!$face) {
            $this->line("[face]     {$imei} → SHOT result with no matching enrollment (cmdNo {$cmdNo}): " . ($content ?: '—'));
            Log::info('Unmatched face SHOT result', ['imei' => $imei, 'cmdNo' => $cmdNo, 'content' => $content]);
            return;
        }

        $face->update([
            'status'      => $ok ? 'enrolled' : 'failed',
            'error'       => $ok ? null : ($content ?: 'Face capture failed.'),
            'enrolled_at' => $ok ? now() : $face->enrolled_at,
        ]);

        $this->line("[face]     {$imei} → SHOT " . ($ok ? 'OK' : 'FAILED') . " for driver #{$face->driver_id}: {$content}");
    }

    /**
     * Logs one row per JC171 AFIF face-recognition check (see FaceRecognitionEvent's migration
     * docblock). driver_id is only set when the IMEI has exactly one enrolled DriverFace — with
     * more than one enrolled driver on the same device there's no way to tell which face matched
     * from this payload, so it's left null rather than guessed.
     */
    private function recordFaceRecognitionEvent(string $imei, array $data, string $result): void
    {
        $rawFiles = $data['alert.file'] ?? $data['alertFile'] ?? null;
        $fileNames = $rawFiles ? array_values(array_filter(array_map('trim', explode(',', $rawFiles)))) : [];

        $enrolledDriverIds = DriverFace::where('imei', $imei)->where('status', 'enrolled')->pluck('driver_id')->unique();
        $driverId = $enrolledDriverIds->count() === 1 ? $enrolledDriverIds->first() : null;

        $timeMs = $data['alert.time'] ?? $data['alertTime'] ?? $data['device.time'] ?? null;

        FaceRecognitionEvent::create([
            'imei'        => $imei,
            'driver_id'   => $driverId,
            'result'      => $result,
            'file_names'  => $fileNames,
            'latitude'    => $data['gnss.lat'] ?? $data['latitude'] ?? null,
            'longitude'   => $data['gnss.lng'] ?? $data['longitude'] ?? null,
            'occurred_at' => $timeMs ? Carbon::createFromTimestampMs((int) $timeMs) : now(),
        ]);
    }

    /**
     * Persists one row per TurboHive fuel-sensor alert (Low Fuel/1222, Fuel Level Abnormal/1223,
     * Fuel Level Increased/1224, Fuel Level Dropped/1225 — see DeviceAlertReceived::KNOWN_CODE_NAMES
     * for name/trigger_type/severity/description) so Fuel Management has a real persisted history
     * to report on, same "insert a row every time this fires" pattern as
     * recordFaceRecognitionEvent/GeofenceMonitorService. $alert is the already-normalized array
     * from DeviceAlertReceived::broadcastWith() (code/name/severity/triggerType/description/
     * latitude/longitude), not the raw MQTT payload — this is called right after that event is
     * broadcast, so there's no need to re-derive the same lookup here.
     *
     * Only the "loss/drop" subset (FUEL_LOSS_ALERT_CODES: 1223/1225) also emails alert_recipients
     * subscribed to the 'fuel_alert' category — Low Fuel and Fuel Level Increased aren't failures
     * worth paging someone about.
     */
    private function recordFuelAlert(TurboHiveService $turboHive, string $imei, array $alert): void
    {
        $code = (string) ($alert['code'] ?? '');
        if (!in_array($code, self::FUEL_ALERT_CODES, true)) {
            return;
        }

        $fuelAlert = FuelAlert::create([
            'imei'         => $imei,
            'code'         => $code,
            'type'         => $alert['name'] ?? "Alert Code {$code}",
            'trigger_type' => $alert['triggerType'] ?? 'event',
            'severity'     => $alert['severity'] ?? 'medium',
            'description'  => $alert['description'] ?? null,
            'latitude'     => $alert['latitude'] ?? null,
            'longitude'    => $alert['longitude'] ?? null,
            'occurred_at'  => now(),
        ]);

        $this->line("[fuel]     {$imei} → {$fuelAlert->type} (code {$code})");

        if (in_array($code, self::FUEL_LOSS_ALERT_CODES, true)) {
            $this->sendFuelAlertEmail($turboHive, $fuelAlert);
        }
    }

    /** Sent synchronously — see GeofenceAlertMail's docblock for why (no queue worker runs here). */
    private function sendFuelAlertEmail(TurboHiveService $turboHive, FuelAlert $fuelAlert): void
    {
        $recipients = AlertRecipient::emailsFor('fuel_alert');
        if (empty($recipients)) {
            return;
        }

        try {
            foreach ($recipients as $to) {
                Mail::to($to)->send(new FuelAlertMail($fuelAlert, $this->resolveDeviceName($turboHive, $fuelAlert->imei)));
            }
        } catch (\Throwable $e) {
            Log::warning('Fuel alert email failed to send', [
                'to' => $recipients,
                'fuel_alert_id' => $fuelAlert->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /** Same cache-by-IMEI lookup GeofenceMonitorService uses for its own alert emails. */
    private function resolveDeviceName(TurboHiveService $turboHive, string $imei): ?string
    {
        if (array_key_exists($imei, $this->deviceNameCache)) {
            return $this->deviceNameCache[$imei];
        }

        $name = null;
        try {
            $list = $turboHive->getDevices(['keyword' => $imei, 'size' => 5])['data'] ?? [];
            $match = collect($list)->firstWhere('imei', $imei);
            $name = $match['deviceName'] ?? null;
        } catch (\Throwable $e) {
            Log::warning('Failed to resolve device name for fuel alert email', [
                'imei' => $imei,
                'error' => $e->getMessage(),
            ]);
        }

        return $this->deviceNameCache[$imei] = $name;
    }

    /**
     * Compares a fresh fuel-level reading against the last one seen for this IMEI and persists a
     * FuelRefuelEvent row when the rise crosses REFUEL_RISE_THRESHOLD — this is what makes the
     * Refuelling report a real history instead of a live-only on-demand OBD scan (see
     * fuel_refuel_events migration).
     */
    /**
     * Reads-then-updates the shared last-known {fuel, odometer} cache exactly once per reading, so
     * detectRefuel and detectAbnormalLoss both compare against the same "previous" snapshot instead
     * of racing to update it out from under each other.
     */
    private function handleFuelReading(string $imei, ?float $fuel, ?float $odometer): void
    {
        if ($fuel === null) {
            if ($odometer !== null) {
                $this->lastOdometerByImei[$imei] = $odometer;
            }
            return;
        }

        $previousFuel     = $this->lastFuelLevelByImei[$imei] ?? null;
        $previousOdometer = $this->lastOdometerByImei[$imei] ?? null;

        if ($previousFuel !== null) {
            $this->detectRefuel($imei, $previousFuel, $fuel);
            $this->detectAbnormalLoss($imei, $previousFuel, $fuel, $previousOdometer, $odometer);
        }

        $this->lastFuelLevelByImei[$imei] = $fuel;
        if ($odometer !== null) {
            $this->lastOdometerByImei[$imei] = $odometer;
        }
    }

    private function detectRefuel(string $imei, float $previous, float $fuel): void
    {
        $change = round($fuel - $previous, 2);
        if ($change < self::REFUEL_RISE_THRESHOLD) {
            return;
        }

        FuelRefuelEvent::create([
            'imei'           => $imei,
            'from_percent'   => $previous,
            'to_percent'     => $fuel,
            'change_percent' => $change,
            'detected_at'    => now(),
        ]);

        $this->line("[refuel]   {$imei} → {$previous}% → {$fuel}% (+{$change}%)");
    }

    /**
     * A drop of at least ABNORMAL_DROP_THRESHOLD% with under ABNORMAL_DROP_MAX_KM travelled between
     * the same two readings reads as a leak/siphon rather than normal consumption while driving.
     * Requires an odometer on both readings — silently skipped otherwise, since there's no way to
     * confirm "barely moved" without it (see DeviceSensorUpdated's odometer extraction caveat).
     */
    private function detectAbnormalLoss(string $imei, float $previousFuel, float $fuel, ?float $previousOdometer, ?float $odometer): void
    {
        if ($previousOdometer === null || $odometer === null) {
            return;
        }

        $change = round($fuel - $previousFuel, 2);
        if ($change > -self::ABNORMAL_DROP_THRESHOLD) {
            return;
        }

        $distance = round($odometer - $previousOdometer, 2);
        if ($distance < 0 || $distance > self::ABNORMAL_DROP_MAX_KM) {
            return;
        }

        FuelAbnormalLossEvent::create([
            'imei'             => $imei,
            'from_percent'     => $previousFuel,
            'to_percent'       => $fuel,
            'change_percent'   => $change,
            'from_odometer_km' => $previousOdometer,
            'to_odometer_km'   => $odometer,
            'distance_km'      => $distance,
            'detected_at'      => now(),
        ]);

        $this->line("[fuelloss] {$imei} → {$previousFuel}% → {$fuel}% ({$change}%) over {$distance}km");
    }

    /**
     * Starts an idle run the moment speed drops to/under IDLE_SPEED_KMH, and closes + saves it once
     * speed rises back above that — mirrors the old on-demand Idle Fuel report's contiguous-run
     * segmentation, just done incrementally against the live stream instead of a fetched-after-the-
     * fact point list. A run shorter than MIN_IDLE_DURATION_SECONDS is dropped as noise.
     */
    private function detectIdleFuel(string $imei, ?float $speed, ?float $totalFuelConsumption): void
    {
        if ($speed === null) {
            return;
        }

        $run = $this->idleRunByImei[$imei] ?? null;

        if ($speed <= self::IDLE_SPEED_KMH) {
            if ($run === null) {
                $this->idleRunByImei[$imei] = ['startTime' => now(), 'startFuelTotal' => $totalFuelConsumption];
            }
            return;
        }

        if ($run === null) {
            return;
        }
        unset($this->idleRunByImei[$imei]);

        $durationSeconds = now()->diffInSeconds($run['startTime']);
        if ($durationSeconds < self::MIN_IDLE_DURATION_SECONDS) {
            return;
        }

        $fuelUsed = ($run['startFuelTotal'] !== null && $totalFuelConsumption !== null)
            ? round($totalFuelConsumption - $run['startFuelTotal'], 2)
            : null;

        FuelIdleEvent::create([
            'imei'       => $imei,
            'start_time' => $run['startTime'],
            'end_time'   => now(),
            'fuel_used'  => $fuelUsed,
        ]);

        $this->line("[idle]     {$imei} → idled {$durationSeconds}s" . ($fuelUsed !== null ? ", used {$fuelUsed}L" : ''));
    }

    private function extractImei(string $topic): string
    {
        $parts = explode('/', $topic);
        return end($parts);
    }
}
