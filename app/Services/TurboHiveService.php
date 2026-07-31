<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class TurboHiveService
{
    protected string $baseUrl;
    protected string $token;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.turbohive.base_url'), '/');
        $this->token   = config('services.turbohive.token');
    }

    protected function client()
    {
        return Http::withHeaders([
            'Authorization' => "Bearer {$this->token}",
            'Content-Type'  => 'application/json',
        ])->baseUrl($this->baseUrl);
    }

    // ── Devices ─────────────────────────────────────────────────────────────

    public function getDevices(array $params = []): array
    {
        $query = array_merge(['page' => 1, 'size' => 20], $params);
        $body  = $this->client()->get('/v3/devices/page', $query)->json();
        // Return full paginated envelope so the controller can forward page/total to the frontend
        return $body['data'] ?? [];
    }

    public function getDeviceStatus(array $imeis): array
    {
        $body = $this->client()->post('/v3/devices/status/bulk', ['imeis' => $imeis])->json();
        return $body['data'] ?? [];
    }

    public function getDevice(int $id): array
    {
        $body = $this->client()->get("/v3/devices/{$id}")->json();
        return $body['data'] ?? [];
    }

    /**
     * Registers a device (already provisioned by the vendor) into this account by IMEI, via
     * POST /v3/devices/import/single. Required: imei (digits only, max 25 chars), manufacturer
     * (vendorCode, e.g. "JIMI", max 50 chars), model (modelCode, max 50 chars). Optional:
     * deviceName (max 50 chars), deviceType, protocol. Returns the raw TurboHive envelope — code
     * is anything but 1000 on failure: 1101 not authenticated, 1202 missing required parameter,
     * 1203 invalid parameter format, 1204 parameter value out of range, 2002 device already
     * exists, 2006 model not found, 2009 vendor not found, 2010 invalid device type, 2026 private
     * deployment accounts can't add devices, 4001 device quota exceeded, 4005 user quota not
     * initialized, 4007 quota update failed — so the caller can surface `message` as-is (see
     * ImportDeviceModal.jsx's ERROR_HINTS for the full code -> friendly-message mapping).
     */
    public function importDevice(array $data): array
    {
        $payload = array_filter($data, fn ($v) => $v !== null && $v !== '');
        return $this->client()->post('/v3/devices/import/single', $payload)->json() ?? [];
    }

    public function deleteDevice(int $id): array
    {
        return $this->client()->delete("/v3/devices/{$id}")->json() ?? [];
    }

    /** Device vendor catalog (id, vendorCode, vendorName, ...) — for the import form's dropdown. */
    public function getVendors(): array
    {
        $body = $this->client()->get('/v3/vendors')->json();
        return $body['data'] ?? [];
    }

    /** Device model catalog (id, vendorId, modelCode, modelName, deviceType, protocol, ...). */
    public function getModels(): array
    {
        $body = $this->client()->get('/v3/models')->json();
        return $body['data'] ?? [];
    }

    // ── Location / Track ────────────────────────────────────────────────────

    /**
     * Real-time location from Redis cache.
     * type=0: all devices, type=1: specific IMEI list.
     */
    public function getDeviceLocation(string $imei): array
    {
        $body = $this->client()->post('/v3/track/location', [
            'type'  => 1,
            'imeis' => [$imei],
        ])->json();

        $list = $body['data']['list'] ?? [];
        return $list[0] ?? [];
    }

    public function getAllLocations(): array
    {
        $body = $this->client()->post('/v3/track/location', ['type' => 0])->json();
        return $body['data']['list'] ?? [];
    }

    /**
     * Same source as getAllLocations()/getDeviceLocation() (POST /v3/track/location), but flattens
     * the dotted key format (e.g. "gnss.lat", "device.batteryVoltage") into plain fields for the
     * Positioning & Battery report.
     */
    public function getPositioningBattery(array $imeis = []): array
    {
        $body = $imeis
            ? $this->client()->post('/v3/track/location', ['type' => 1, 'imeis' => $imeis])->json()
            : $this->client()->post('/v3/track/location', ['type' => 0])->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['list' => [], 'error' => $body['message'] ?? 'Failed to query positions.'];
        }

        $list = array_map(fn (array $p) => [
            'imei'       => $p['device.imei'] ?? null,
            'latitude'   => $p['gnss.lat'] ?? null,
            'longitude'  => $p['gnss.lng'] ?? null,
            'altitude'   => $p['gnss.altitude'] ?? null,
            'course'     => $p['gnss.course'] ?? null,
            'satellites' => $p['gnss.satellites'] ?? null,
            'fixType'    => $p['gnss.fixType'] ?? null,
            'acc'        => $p['status.acc'] ?? null,
            'battery'    => $p['device.batteryVoltage'] ?? null,
            'serverTime' => $p['server.time'] ?? null,
        ], $body['data']['list'] ?? []);

        return ['list' => $list];
    }

    /**
     * Flattens a normalized track point's dotted key format (e.g. "gnss.lat", "device.time")
     * into plain fields, shared by getTrack() and getTrackList().
     */
    private function normalizeTrackPoint(array $p): array
    {
        return [
            'deviceTime' => $p['device.time'] ?? null,
            'meter'      => $p['device.meter'] ?? null,
            'latitude'   => $p['gnss.lat'] ?? null,
            'longitude'  => $p['gnss.lng'] ?? null,
            'altitude'   => $p['gnss.altitude'] ?? null,
            'speed'      => $p['gnss.speed'] ?? null,
            'course'     => $p['gnss.course'] ?? null,
            'satellites' => $p['gnss.satellites'] ?? null,
            'fixType'    => $p['gnss.fixType'] ?? null,
            'method'     => $p['positioning.method'] ?? null,
            'acc'        => $p['status.acc'] ?? null,
        ];
    }

    /**
     * Historical GNSS track, paginated (max 30-day range). See normalizeTrackPoint().
     *
     * @param int $startTime Unix timestamp in milliseconds
     * @param int $endTime   Unix timestamp in milliseconds
     */
    public function getTrack(string $imei, int $startTime, int $endTime, int $pageSize = 1000): array
    {
        $body = $this->client()->get('/v3/track', [
            'imei'      => $imei,
            'startTime' => $startTime,
            'endTime'   => $endTime,
            'pageSize'  => $pageSize,
        ])->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['list' => [], 'error' => $body['message'] ?? 'Failed to query track.'];
        }

        $list = array_map(
            fn (array $p) => $this->normalizeTrackPoint($p),
            $body['data']['list'] ?? []
        );

        return [
            'list'            => $list,
            'hasNext'         => $body['data']['hasNext'] ?? false,
            'nextPageState'   => $body['data']['nextPageState'] ?? null,
            'currentPageSize' => $body['data']['currentPageSize'] ?? count($list),
        ];
    }

    /**
     * Historical GNSS track, complete and unpaginated (max 30-day range) — used for Replay, which
     * needs the whole route loaded up front to animate. See normalizeTrackPoint().
     *
     * @param int $startTime Unix timestamp in milliseconds
     * @param int $endTime   Unix timestamp in milliseconds
     */
    public function getTrackList(string $imei, int $startTime, int $endTime): array
    {
        $body = $this->client()->get('/v3/track/list', [
            'imei'      => $imei,
            'startTime' => $startTime,
            'endTime'   => $endTime,
        ])->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['list' => [], 'error' => $body['message'] ?? 'Failed to query track.'];
        }

        $list = array_map(
            fn (array $p) => $this->normalizeTrackPoint($p),
            $body['data']['list'] ?? []
        );

        return [
            'list'       => $list,
            'totalCount' => $body['data']['totalCount'] ?? count($list),
        ];
    }

    // ── Mileage ─────────────────────────────────────────────────────────────

    /**
     * Realtime per-device mileage totals (total / today / subtotal), current ACC and speed, and
     * online status. Paginated — not a date-range report.
     */
    public function getRealtimeMileage(array $params = []): array
    {
        $defaults = ['page' => 1, 'size' => 20];
        $body = $this->client()->get('/v3/mileage/realtime', array_merge($defaults, $params))->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['data' => [], 'page' => 1, 'size' => $defaults['size'], 'total' => 0, 'totalPages' => 0, 'error' => $body['message'] ?? 'Failed to query mileage.'];
        }

        return $body['data'] ?? ['data' => []];
    }

    // ── Trips ───────────────────────────────────────────────────────────────

    public function getTripList(string $imei, int $startTime, int $endTime): array
    {
        $body = $this->client()->get('/v3/trip/list', [
            'imei'      => $imei,
            'startTime' => $startTime,
            'endTime'   => $endTime,
        ])->json();

        return $body['data'] ?? [];
    }

    // ── Alerts ──────────────────────────────────────────────────────────────

    /**
     * Flattens dotted-key alert fields (e.g. "alert.time", "device.imei") into plain fields, pulls
     * `speed` out of alert.extraInfo's JSON-encoded gpsSpeed when the device reports it (only
     * observed on some alert types), and normalizes the `attachment` array (dashcam/ADAS evidence
     * photos/videos, e.g. for Camera Fault or harsh-driving alerts) into plain fields too.
     *
     * Accepts TurboHive's documented query params directly via $params: page, size, alertType
     * (matches alert.type), alertCode (matches alert.code), startTime/endTime (ms timestamps),
     * imeis (array).
     */
    public function getAlerts(array $params = []): array
    {
        $defaults = ['page' => 1, 'size' => 50];
        $body = $this->client()->get('/v3/alerts/page', array_merge($defaults, $params))->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['list' => [], 'page' => 1, 'size' => $defaults['size'], 'total' => 0, 'error' => $body['message'] ?? 'Failed to query alerts.'];
        }

        $list = array_map(function (array $a) {
            $extra = json_decode($a['alert.extraInfo'] ?? '', true) ?: [];

            $attachments = array_map(fn (array $m) => [
                'id'          => $m['media.id'] ?? null,
                'channel'     => $m['media.channel'] ?? null,
                'fileName'    => $m['media.fileName'] ?? null,
                'fileSize'    => $m['media.fileSize'] ?? null,
                'url'         => $m['media.storagePath'] ?? null,
                'captureTime' => $m['media.captureTime'] ?? null,
            ], $a['attachment'] ?? []);

            return [
                'id'           => $a['alert.id'] ?? null,
                'imei'         => $a['device.imei'] ?? null,
                'deviceName'   => $a['device.name'] ?? null,
                'name'         => $a['alert.name'] ?? null,
                'description'  => $a['alert.description'] ?? null,
                'code'         => $a['alert.code'] ?? null,
                'type'         => $a['alert.type'] ?? null,
                'status'       => $a['alert.status'] ?? null,
                'triggerType'  => $a['alert.triggerType'] ?? null,
                'firingStatus' => $a['alert.firingStatus'] ?? null,
                'time'         => $a['alert.time'] ?? null,
                'latitude'     => $a['gnss.lat'] ?? null,
                'longitude'    => $a['gnss.lng'] ?? null,
                'speed'        => $extra['gpsSpeed'] ?? null,
                'attachments'  => $attachments,
            ];
        }, $body['data']['list'] ?? []);

        return [
            'list'  => $list,
            'page'  => $body['data']['page'] ?? 1,
            'size'  => $body['data']['size'] ?? $defaults['size'],
            'total' => $body['data']['total'] ?? count($list),
        ];
    }

    // ── Media Gallery ───────────────────────────────────────────────────────

    /**
     * TurboHive's authoritative media library (GET /v3/resource/page) — every photo/video the
     * platform has stored for an account, regardless of how it got there (a device's own periodic
     * capture, an alert's attached evidence once uploaded via UPLOADFILE, etc). This is the same
     * data requestAlertFileUpload()'s round-trip ultimately lands in — storagePath here is a real,
     * directly-usable URL (confirmed via a live response, unlike alert.file's bare filenames).
     *
     * Accepts TurboHive's documented query params directly via $params: page, size (required),
     * imei, channel, mediaType (0=Image, 1=Video, 2=Audio), eventType (docs say "capture, alarm,
     * historical" but a live response showed "alert" too, so this isn't validated as a strict
     * enum), keyword, startTime/endTime (ms timestamps).
     */
    public function getResources(array $params = []): array
    {
        $defaults = ['page' => 1, 'size' => 20];
        $body = $this->client()->get('/v3/resource/page', array_merge($defaults, $params))->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['data' => [], 'page' => 1, 'size' => $defaults['size'], 'total' => 0, 'totalPages' => 0, 'error' => $body['message'] ?? 'Failed to query media.'];
        }

        return $body['data'] ?? ['data' => []];
    }

    /**
     * Bulk-deletes media from TurboHive's library (POST /v3/resource/delete/bulk). Async on
     * TurboHive's side — the response is just an acknowledgement ({taskId, totalCount}), not
     * confirmation the files are actually gone yet. Only one delete task can be in flight per
     * account at a time — a second call while one is running returns code 3210 rather than
     * queuing, so the caller should surface that distinctly rather than treating it as a generic
     * failure. Full response (including `code`/`message`) is returned as-is so the caller can
     * branch on TurboHive's documented error codes (1101 unauthenticated, 1205 invalid time range,
     * 1216 duplicate ids, 3001 not found, 3210 delete task already running).
     */
    public function deleteResources(array $mediaIds): array
    {
        $body = $this->client()->post('/v3/resource/delete/bulk', [
            'mediaIds' => array_values(array_unique($mediaIds)),
        ])->json();

        return $body ?? [];
    }

    // ── OBD ─────────────────────────────────────────────────────────────────

    /**
     * Historical OBD telemetry (max 30-day range). Field `batteryVoltage` (mV) is the vehicle's
     * external power-supply voltage, as opposed to the internal device battery reported via
     * getBatteryStatus().
     *
     * @param int $startTime Unix timestamp in milliseconds
     * @param int $endTime   Unix timestamp in milliseconds
     */
    public function getObdData(string $imei, int $startTime, int $endTime, int $pageSize = 100, ?string $pagingState = null): array
    {
        $query = array_filter([
            'imei'        => $imei,
            'startTime'   => $startTime,
            'endTime'     => $endTime,
            'pageSize'    => $pageSize,
            'pagingState' => $pagingState,
        ], fn ($v) => $v !== null);

        $body = $this->client()->get('/v3/obd', $query)->json();

        if ((int) ($body['code'] ?? 0) !== 1000) {
            return ['obdData' => [], 'error' => $body['message'] ?? 'Failed to query OBD data.'];
        }

        return $body['data'] ?? ['obdData' => []];
    }

    // ── Commands ────────────────────────────────────────────────────────────

    public function sendCommand(string $imei, string $content, bool $sync = true, int $timeout = 30): array
    {
        $body = $this->client()->post('/v3/command/send', [
            'imei'    => $imei,
            'content' => $content,
            'sync'    => $sync,
            'offline' => true,
            'timeout' => $timeout,
        ])->json();

        return $body ?? [];
    }

    /**
     * Sends the same command to multiple devices in one request (see the Command module,
     * CommandPage.jsx). Async (sync=false) is TurboHive's own recommendation for batch dispatch to
     * avoid head-of-line blocking — results still arrive in this response's data.results per-imei
     * when available, but for a large/slow batch a device's row may only show as accepted here and
     * settle later (TurboHive pushes the final result via Kafka, which this app doesn't consume, so
     * TurboHiveController::batchSendCommand persists whatever this call returns as the final word).
     */
    public function batchSendCommand(array $imeis, string $content, array $options = []): array
    {
        $body = $this->client()->post('/v3/command/batchSend', array_filter([
            'batchId'       => $options['batchId'] ?? null,
            'imeis'         => $imeis,
            'content'       => $content,
            'msgId'         => $options['msgId'] ?? '80',
            'language'      => $options['language'] ?? null,
            'sync'          => $options['sync'] ?? false,
            'offline'       => $options['offline'] ?? true,
            'timeout'       => $options['timeout'] ?? 30,
            'batchTimeout'  => $options['batchTimeout'] ?? 45,
            'messageFormat' => $options['messageFormat'] ?? 'text',
            'isManual'      => $options['isManual'] ?? true,
        ], fn ($v) => $v !== null))->json();

        return $body ?? [];
    }

    /**
     * Requests the device push a set of already-captured evidence files (photos/video) off-device,
     * per the TH Integration Guide's "Generate File Upload Command from JSON" step — the device's
     * alert push only lists filenames it already has locally, it doesn't upload them itself. Result
     * arrives asynchronously on {userId}/notify/{imei} (see MqttWorker's notify/# handler), not in
     * this command's response.
     *
     * @param string[] $fileNames from the triggering alert's alert.file (comma-separated in the
     *                            raw payload — split before calling this).
     * @param int $alertTimeSeconds alert.time is a millisecond timestamp; the device only accepts
     *                              10-digit seconds, so divide by 1000 before passing it in here.
     */
    public function requestAlertFileUpload(string $imei, array $fileNames, int $alertTimeSeconds, int $alertType, float $lng, float $lat): array
    {
        $content = 'UPLOADFILE,' . implode(',', $fileNames) . ",{$alertTimeSeconds},{$alertType},{$lng},{$lat}#";

        return $this->sendCommand($imei, $content);
    }

    // ── Relay (Immobilizer) ─────────────────────────────────────────────────
    // RELAY,<state>,<channel># — 1 disconnects (cuts) the relay, 0 reconnects it. Channel is the
    // relay output number configured on the device (fleet default here is 10). Sent through
    // sendCommand() like every other raw EVENTSET-style command — see UnregisteredDriverAlertService
    // for the caller that gates this behind a per-vehicle opt-in and a stationary-vehicle check.

    public function disconnectRelay(string $imei, int $channel = 10): array
    {
        return $this->sendCommand($imei, "RELAY,1,{$channel}#");
    }

    public function connectRelay(string $imei, int $channel = 10): array
    {
        return $this->sendCommand($imei, "RELAY,0,{$channel}#");
    }

    // ── Face Recognition ────────────────────────────────────────────────────
    // All FACE,*/AFIF commands are raw EVENTSET strings sent through sendCommand() (POST
    // /v3/command/send) — TurboHive has no dedicated REST endpoint for on-device face
    // enrollment; JC171 owns the face database locally. Driver identity is passed as
    // "<driverId>,<name>" (SHOT) or "<driverId>-<name>" (DEL/GET), per the JC171 EVENTSET,FACE spec.

    /**
     * Configures AFIF facial-recognition sensitivity/timing, or disables it entirely.
     *
     * @param int|string $similarity 0-100 match threshold, or 'OFF' to disable recognition.
     */
    public function configureFaceRecognition(string $imei, int|string $similarity, int $deadlineSeconds = 180, int $recheckMinutes = 10): array
    {
        return $this->sendCommand($imei, "EVENTSET,AFIF,{$similarity},{$deadlineSeconds},{$recheckMinutes}#");
    }

    /** Captures a live photo on-device and enrolls it under the given driver id/name. */
    public function enrollDriverFace(string $imei, string $driverId, string $name): array
    {
        return $this->sendCommand($imei, "EVENTSET,FACE,SHOT,{$driverId},{$name}#");
    }

    /** Forces an immediate on-device recognition check — useful for troubleshooting a specific unit. */
    public function testFaceRecognition(string $imei): array
    {
        return $this->sendCommand($imei, 'EVENTSET,FACE,TEST#');
    }

    /** Deletes one or more enrolled faces. Each entry is formatted "driverId-name". */
    public function deleteDriverFace(string $imei, array $entries): array
    {
        return $this->sendCommand($imei, 'EVENTSET,FACE,DEL,' . implode(',', $entries) . '#');
    }

    /** Bulk-imports faces from a zipped photo batch at a cloud URL (device pulls it over the TTL link). */
    public function importFaceBatch(string $imei, string $url): array
    {
        return $this->sendCommand($imei, "EVENTSET,FACE,DOWN,{$url}#");
    }

    /** Requests the device re-upload one driver's stored face photo. Entry formatted "driverId-name". */
    public function fetchDriverFace(string $imei, string $entry): array
    {
        return $this->sendCommand($imei, "EVENTSET,FACE,GET,{$entry}#");
    }

    /** Requests a full roster dump (TXT, uploaded asynchronously) of every enrolled driver id/name on-device. */
    public function checkFaceRoster(string $imei): array
    {
        return $this->sendCommand($imei, 'EVENTSET,FACE,CHECK#');
    }

    /** Points the device's captured face photos at our own upload endpoint instead of TurboHive's default. */
    public function setFaceUploadUrl(string $imei, string $url): array
    {
        return $this->sendCommand($imei, "UPLOADFACE,{$url}#");
    }

    /**
     * Uploads a face image straight to TurboHive's device-facing ingest endpoint (POST
     * /face/uploadPic — see face-upload-api.md), the same API the JC171 itself calls after an
     * EVENTSET,FACE,SHOT capture. Used to push a browser-captured/selected photo into TurboHive
     * without a real device-issued instructionId — TurboHive only uses it to build the request
     * signature, so we mint our own. Response codes are 200/400/403/500, not the v3 API's
     * 1000-based codes used elsewhere in this class.
     */
    public function uploadFacePhoto(string $imei, string $fileName, string $contents = ''): array
    {
        $url = config('services.turbohive.face_upload_api_url');
        if (!$url) {
            throw new \RuntimeException('TURBOHIVE_FACE_UPLOAD_API_URL is not configured — set it in .env to the vendor-provided face upload host (see face-upload-api.md).');
        }

        $secretKey     = config('services.turbohive.face_upload_secret_key');
        $instructionId = strtoupper(bin2hex(random_bytes(4)));
        $timestamp     = (string) now()->getTimestampMs();
        $sign          = rtrim(base64_encode(md5($imei . $instructionId . $secretKey . $timestamp)));

        $body = Http::attach('file', $contents, $fileName)
            ->post($url, [
                'imei'          => $imei,
                'instructionId' => $instructionId,
                'timestamp'     => $timestamp,
                'sign'          => $sign,
            ])->json();

        // '_request' isn't part of TurboHive's response — merged in so callers (and, via
        // testUploadToTurboHive's passthrough, the browser's Network tab) can see exactly what
        // was sent without needing server log access.
        return array_merge($body ?? [], [
            '_request' => [
                'url'           => $url,
                'imei'          => $imei,
                'fileName'      => $fileName,
                'instructionId' => $instructionId,
                'timestamp'     => $timestamp,
                'sign'          => $sign,
            ],
        ]);
    }

    // ── Battery ─────────────────────────────────────────────────────────────

    /**
     * TurboHive has no REST endpoint for internal battery on non-Tag devices — this
     * sends the "status#" query command and parses the device's text response, e.g.
     * "Battery:4.12V,NORMAL; SOC:Link Up; LTE Signal Level:Strong; GPS:OFF; ACC:OFF; ...".
     */
    public function getBatteryStatus(string $imei): array
    {
        $result  = $this->sendCommand($imei, 'status#');
        $content = $result['data']['content'] ?? '';

        $voltage = null;
        $status  = null;
        if (preg_match('/Battery:([\d.]+)V,(\w+)/i', $content, $m)) {
            $voltage = (float) $m[1];
            $status  = strtoupper($m[2]);
        }

        // "LTE Signal Level:Strong" — cellular signal descriptor, shown on the device detail
        // panel (Dashboard.jsx's DeviceDetailPanel) since TurboHive's device-list/position feeds
        // carry no signal-strength field of their own (see normalizeTurboHiveDevice's `signal`,
        // which is effectively always 0 for TurboHive devices).
        $signalLevel = null;
        if (preg_match('/LTE Signal Level:\s*(\w+)/i', $content, $sm)) {
            $signalLevel = ucfirst(strtolower($sm[1]));
        }

        // TurboHive returns code=1000 on success; anything else (2004 device offline,
        // 2001 not found, 1001 internal error, ...) means content has no battery reading.
        $error = ((int) ($result['code'] ?? 0) !== 1000 && $voltage === null)
            ? ($result['message'] ?? 'Failed to query battery.')
            : null;

        return [
            'imei'        => $imei,
            'voltage'     => $voltage,
            'status'      => $status,
            'signalLevel' => $signalLevel,
            'error'       => $error,
            'raw'         => $content,
            'checkedAt'   => now()->getTimestampMs(),
        ];
    }

    // ── Live Video ──────────────────────────────────────────────────────────

    public function startLiveVideo(string $imei, int $channel = 1, string $dataType = 'audio_video'): array
    {
        $body = $this->client()->post('/v3/video/live/start', [
            'imei'     => $imei,
            'channel'  => $channel,
            'dataType' => $dataType,
        ])->json();

        return $body ?? [];
    }

    public function stopLiveVideo(string $imei, int $channel = 1): array
    {
        $body = $this->client()->post('/v3/video/live/stop', [
            'imei'    => $imei,
            'channel' => $channel,
        ])->json();

        return $body ?? [];
    }

    // ── Video Files & Playback ──────────────────────────────────────────────

    public function listVideoFiles(string $imei, int $channel, int $startTime, int $endTime): array
    {
        $body = $this->client()->post('/v3/video/files/list', [
            'imei'      => $imei,
            'channel'   => $channel,
            'startTime' => (string) $startTime,
            'endTime'   => (string) $endTime,
        ])->json();

        return $body ?? [];
    }

    public function startPlayback(string $imei, int $channel, array $fileNames): array
    {
        $body = $this->client()->post('/v3/video/playback/start', [
            'imei'      => $imei,
            'channel'   => $channel,
            'fileNames' => $fileNames,
        ])->json();

        return $body ?? [];
    }

    public function stopPlayback(string $imei, int $channel = 1): array
    {
        $body = $this->client()->post('/v3/video/playback/stop', [
            'imei'    => $imei,
            'channel' => $channel,
        ])->json();

        return $body ?? [];
    }

    // ── Capture ─────────────────────────────────────────────────────────────

    /**
     * @param int $type 1=single snapshot, 2=continuous snapshot, 3=recording
     */
    public function startCapture(string $imei, int $channel = 1, int $type = 1, int $duration = 5): array
    {
        $body = $this->client()->post('/v3/video/capture/start', [
            'imei'     => $imei,
            'channel'  => $channel,
            'type'     => $type,
            'duration' => $duration,
        ])->json();

        return $body ?? [];
    }
}
