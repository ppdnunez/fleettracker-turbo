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
use App\Services\DriverRecognizedAlertService;
use App\Services\GeofenceMonitorService;
use App\Services\TurboHiveService;
use App\Services\UnregisteredDriverAlertService;
use Carbon\Carbon;

class MqttWorker extends Command
{
    protected $signature   = 'mqtt:worker';
    protected $description = 'Listen to TurboHive MQTT and broadcast device positions to frontend';

    /** Reset to the minimum after any connection that survives long enough to be considered
     *  "healthy", so a brief blip doesn't leave future reconnects waiting on a stale long delay. */
    private const MIN_BACKOFF_SECONDS = 3;
    private const MAX_BACKOFF_SECONDS = 60;
    private const HEALTHY_AFTER_SECONDS = 30;

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
            }

            if ($faceRecognizedCode !== null && $faceRecognizedCode !== '' && (string) $alert['code'] === (string) $faceRecognizedCode) {
                $driverRecognizedAlert->handle($imei);
            }

            $this->requestAlertFileUpload($turboHive, $imei, $data);
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

            $fuel = $event->broadcastWith()['fuelLevel'];
            $this->line("[sensor]   {$imei} ({$topic}) → fuel=" . ($fuel ?? '?'));
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
            if (!is_array($fileList)) {
                // Logged rather than silently dropped — no confirmation has ever been observed on
                // this topic yet (see AlertFileUpload rows stuck at status=requested), so if
                // TurboHive is sending something back in an unrecognized shape, this is the only
                // way to see it and adjust the parsing above.
                $this->line("[notify]   {$imei} → unrecognized shape (no upload.fileList): " . substr($message, 0, 200));
                Log::info('Unrecognized notify/# payload', ['imei' => $imei, 'raw' => $data]);
                return;
            }

            $this->recordUploadResult($imei, $data, $fileList);
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

    private function extractImei(string $topic): string
    {
        $parts = explode('/', $topic);
        return end($parts);
    }
}
