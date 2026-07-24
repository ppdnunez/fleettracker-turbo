<?php

namespace App\Http\Controllers;

use App\Models\DeviceCommand;
use App\Services\TurboHiveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TurboHiveController extends Controller
{
    public function __construct(protected TurboHiveService $turboHive)
    {
    }

    // ── MQTT config (used by mqtt:worker / frontend bootstrap) ──────────────

    public function mqttConfig(): JsonResponse
    {
        $cfg = config('services.turbohive_mqtt');
        return response()->json([
            'host'     => $cfg['host'],
            'port'     => (int) $cfg['port'],
            'username' => $cfg['username'],
            'userId'   => $cfg['user_id'],
        ]);
    }

    // ── Devices ─────────────────────────────────────────────────────────────

    public function devices(Request $request): JsonResponse
    {
        $params = array_filter($request->only([
            'page', 'size', 'keyword', 'deviceType', 'manufacturer', 'model',
            'protocol', 'importTimeStart', 'importTimeEnd',
        ]), fn($v) => $v !== null && $v !== '');

        return response()->json($this->turboHive->getDevices($params));
    }

    public function deviceStatus(Request $request): JsonResponse
    {
        $imeis = $request->input('imeis', []);
        if (is_string($imeis)) {
            $imeis = array_filter(array_map('trim', explode(',', $imeis)));
        }
        return response()->json($this->turboHive->getDeviceStatus(array_values($imeis)));
    }

    public function deviceDetail(int $id): JsonResponse
    {
        return response()->json($this->turboHive->getDevice($id));
    }

    public function importDevice(Request $request): JsonResponse
    {
        $request->validate([
            'imei'         => 'required|string',
            'manufacturer' => 'required|string',
            'model'        => 'required|string',
            'deviceName'   => 'nullable|string',
            'deviceType'   => 'nullable|string',
            'protocol'     => 'nullable|string',
        ]);

        return response()->json($this->turboHive->importDevice($request->only([
            'imei', 'manufacturer', 'model', 'deviceName', 'deviceType', 'protocol',
        ])));
    }

    public function destroyDevice(int $id): JsonResponse
    {
        return response()->json($this->turboHive->deleteDevice($id));
    }

    public function vendors(): JsonResponse
    {
        return response()->json($this->turboHive->getVendors());
    }

    public function models(): JsonResponse
    {
        return response()->json($this->turboHive->getModels());
    }

    // ── Location ────────────────────────────────────────────────────────────

    public function location(string $imei): JsonResponse
    {
        return response()->json($this->turboHive->getDeviceLocation($imei));
    }

    public function allLocations(): JsonResponse
    {
        return response()->json($this->turboHive->getAllLocations());
    }

    public function positioningBattery(Request $request): JsonResponse
    {
        $imeis = $request->input('imeis', []);
        if (is_string($imeis)) {
            $imeis = array_filter(array_map('trim', explode(',', $imeis)));
        }
        return response()->json($this->turboHive->getPositioningBattery(array_values($imeis)));
    }

    // ── Mileage ─────────────────────────────────────────────────────────────

    public function realtimeMileage(Request $request): JsonResponse
    {
        $params = array_filter($request->only(['page', 'size', 'keyword']), fn ($v) => $v !== null && $v !== '');

        return response()->json($this->turboHive->getRealtimeMileage($params));
    }

    // ── Track ───────────────────────────────────────────────────────────────

    public function track(Request $request, string $imei): JsonResponse
    {
        $startTime = (int) $request->input('startTime', now()->subHours(24)->timestamp * 1000);
        $endTime   = (int) $request->input('endTime', now()->timestamp * 1000);
        $pageSize  = (int) $request->input('pageSize', 1000);

        return response()->json($this->turboHive->getTrack($imei, $startTime, $endTime, $pageSize));
    }

    public function trackList(Request $request, string $imei): JsonResponse
    {
        $startTime = (int) $request->input('startTime', now()->subHours(24)->timestamp * 1000);
        $endTime   = (int) $request->input('endTime', now()->timestamp * 1000);

        return response()->json($this->turboHive->getTrackList($imei, $startTime, $endTime));
    }

    // ── Trips ───────────────────────────────────────────────────────────────

    public function trips(Request $request, string $imei): JsonResponse
    {
        $startTime = (int) $request->input('startTime', now()->startOfDay()->timestamp * 1000);
        $endTime   = (int) $request->input('endTime', now()->timestamp * 1000);

        return response()->json($this->turboHive->getTripList($imei, $startTime, $endTime));
    }

    // ── Alerts ──────────────────────────────────────────────────────────────

    public function alerts(Request $request): JsonResponse
    {
        return response()->json($this->turboHive->getAlerts($request->only([
            'page', 'size', 'imeis', 'alertType', 'alertCode', 'startTime', 'endTime',
        ])));
    }

    // ── Media Gallery ───────────────────────────────────────────────────────

    public function resources(Request $request): JsonResponse
    {
        $params = array_filter($request->only([
            'page', 'size', 'imei', 'channel', 'mediaType', 'eventType', 'keyword', 'startTime', 'endTime',
        ]), fn ($v) => $v !== null && $v !== '');

        return response()->json($this->turboHive->getResources($params));
    }

    public function deleteResources(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mediaIds'   => 'required|array|min:1',
            'mediaIds.*' => 'integer',
        ]);

        return response()->json($this->turboHive->deleteResources($data['mediaIds']));
    }

    // ── OBD ─────────────────────────────────────────────────────────────────

    public function obdData(Request $request, string $imei): JsonResponse
    {
        $startTime = (int) $request->input('startTime', now()->subHours(24)->timestamp * 1000);
        $endTime   = (int) $request->input('endTime', now()->timestamp * 1000);
        $pageSize  = (int) $request->input('pageSize', 100);

        return response()->json($this->turboHive->getObdData($imei, $startTime, $endTime, $pageSize));
    }

    // ── Commands ────────────────────────────────────────────────────────────

    public function sendCommand(Request $request): JsonResponse
    {
        $request->validate(['imei' => 'required|string', 'content' => 'required|string']);
        return response()->json($this->turboHive->sendCommand(
            $request->input('imei'),
            $request->input('content'),
            (bool)  $request->input('sync', true),
            (int)   $request->input('timeout', 30),
        ));
    }

    /**
     * See the Command module (CommandPage.jsx) — sends one command to multiple devices via
     * TurboHive's /v3/command/batchSend, then persists a local device_commands row per IMEI since
     * TurboHive has no history endpoint of its own for this.
     */
    public function batchSendCommand(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imeis'         => 'required|array|min:1',
            'imeis.*'       => 'string',
            'content'       => 'required|string',
            'messageFormat' => 'nullable|in:text,hex',
            'isManual'      => 'nullable|boolean',
            'sync'          => 'nullable|boolean',
            'offline'       => 'nullable|boolean',
            'timeout'       => 'nullable|integer|min:1|max:300',
            'batchTimeout'  => 'nullable|integer|min:1|max:600',
            'msgId'         => 'nullable|string',
            'language'      => 'nullable|string',
            'batchId'       => 'nullable|string',
        ]);

        $imeis  = array_values(array_unique($data['imeis']));
        $result = $this->turboHive->batchSendCommand($imeis, $data['content'], $data);

        $this->recordCommandHistory($imeis, $data, $result);

        return response()->json($result);
    }

    /**
     * TurboHive's batch response's data.results is per-imei when it has one; a request that fails
     * validation before dispatch (e.g. code 1201/2120/2121) has no results at all, so every imei
     * falls back to the top-level code/message instead of being left unrecorded.
     */
    private function recordCommandHistory(array $imeis, array $data, array $result): void
    {
        $resultsByImei = [];
        foreach (($result['data']['results'] ?? []) as $r) {
            if (isset($r['imei'])) {
                $resultsByImei[$r['imei']] = $r;
            }
        }

        $mode          = ($data['sync'] ?? false) ? 'sync' : 'async';
        $messageFormat = $data['messageFormat'] ?? 'text';
        $isManual      = $data['isManual'] ?? true;

        foreach ($imeis as $imei) {
            $perDevice = $resultsByImei[$imei] ?? null;
            $code      = (int) ($perDevice['code'] ?? $result['code'] ?? 0);

            DeviceCommand::create([
                'batch_id'       => $result['data']['batchId'] ?? null,
                'imei'           => $imei,
                'content'        => $data['content'],
                'message_format' => $messageFormat,
                'is_manual'      => $isManual,
                'mode'           => $mode,
                'status'         => $code === 1000 ? 'success' : 'failed',
                'response'       => $perDevice ?? $result,
                'sent_by'        => auth()->id(),
            ]);
        }
    }

    /**
     * Command History list for the Command module — defaults to the current user's own sent
     * commands; ?all=1 shows every user's (the "Show ALL Commands" checkbox in CommandPage.jsx).
     */
    public function commandHistory(Request $request): JsonResponse
    {
        $query = DeviceCommand::with('sentBy:id,name')->orderByDesc('created_at');

        if (!$request->boolean('all')) {
            $query->where('sent_by', $request->user()?->id ?? auth()->id());
        }
        if ($request->filled('imei')) {
            $query->where('imei', $request->query('imei'));
        }

        return response()->json($query->limit(200)->get());
    }

    // ── Battery ─────────────────────────────────────────────────────────────

    public function batteryStatus(string $imei): JsonResponse
    {
        return response()->json($this->turboHive->getBatteryStatus($imei));
    }

    // ── Live Video ──────────────────────────────────────────────────────────

    public function videoStart(Request $request): JsonResponse
    {
        $request->validate(['imei' => 'required|string']);
        return response()->json($this->turboHive->startLiveVideo(
            $request->input('imei'),
            (int)    $request->input('channel', 1),
            (string) $request->input('dataType', 'audio_video'),
        ));
    }

    public function videoStop(Request $request): JsonResponse
    {
        $request->validate(['imei' => 'required|string']);
        return response()->json($this->turboHive->stopLiveVideo(
            $request->input('imei'),
            (int) $request->input('channel', 1),
        ));
    }

    // ── Video Files & Playback ──────────────────────────────────────────────

    public function videoFiles(Request $request): JsonResponse
    {
        $request->validate([
            'imei'      => 'required|string',
            'startTime' => 'required|integer',
            'endTime'   => 'required|integer',
        ]);
        return response()->json($this->turboHive->listVideoFiles(
            $request->input('imei'),
            (int) $request->input('channel', 1),
            (int) $request->input('startTime'),
            (int) $request->input('endTime'),
        ));
    }

    public function playbackStart(Request $request): JsonResponse
    {
        $request->validate(['imei' => 'required|string', 'fileNames' => 'required|array']);
        return response()->json($this->turboHive->startPlayback(
            $request->input('imei'),
            (int) $request->input('channel', 1),
            $request->input('fileNames'),
        ));
    }

    public function playbackStop(Request $request): JsonResponse
    {
        $request->validate(['imei' => 'required|string']);
        return response()->json($this->turboHive->stopPlayback(
            $request->input('imei'),
            (int) $request->input('channel', 1),
        ));
    }

    // ── Capture ─────────────────────────────────────────────────────────────

    public function captureStart(Request $request): JsonResponse
    {
        $request->validate(['imei' => 'required|string']);
        return response()->json($this->turboHive->startCapture(
            $request->input('imei'),
            (int) $request->input('channel', 1),
            (int) $request->input('type', 1),
            (int) $request->input('duration', 5),
        ));
    }
}
