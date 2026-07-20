<?php

namespace App\Http\Controllers;

use App\Models\AlertFileUpload;
use App\Services\TurboHiveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

// Tracking history for the alert-evidence upload round-trip (see MqttWorker's
// requestAlertFileUpload/recordUploadResult and the alert_file_uploads migration docblock).
// index() is system-generated read history; store() is the one user-triggered action — manually
// (re)requesting an UPLOADFILE, e.g. from the live alert feed (Report > Driver Behavior) when
// evidence didn't come through automatically, or for an alert.code MqttWorker's
// ALERT_FILE_UPLOAD_CODES whitelist doesn't auto-request.
class AlertFileUploadController extends Controller
{
    public function __construct(protected TurboHiveService $turboHive)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = AlertFileUpload::orderByDesc('created_at');

        if ($imei = $request->query('imei')) {
            $query->where('imei', $imei);
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json($query->limit(200)->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'          => 'required|string',
            'file_names'    => 'required|array|min:1',
            'file_names.*'  => 'string',
            'alert_time'    => 'nullable|integer', // ms timestamp, as carried in the raw alert payload
            'alert_type'    => 'nullable|integer',
            'alert_code'    => 'nullable|string',
            'longitude'     => 'nullable|numeric',
            'latitude'      => 'nullable|numeric',
        ]);

        $alertTimeMs = $data['alert_time'] ?? null;
        $alertType   = (int) ($data['alert_type'] ?? 0);
        $lng         = (float) ($data['longitude'] ?? 0);
        $lat         = (float) ($data['latitude'] ?? 0);

        $result = $this->turboHive->requestAlertFileUpload(
            $data['imei'],
            $data['file_names'],
            $alertTimeMs ? intdiv((int) $alertTimeMs, 1000) : now()->timestamp,
            $alertType,
            $lng,
            $lat,
        );
        $ok = (int) ($result['code'] ?? 0) === 1000;

        $record = AlertFileUpload::create([
            'imei'         => $data['imei'],
            'alert_type'   => $alertType,
            'alert_code'   => $data['alert_code'] ?? null,
            'alert_time'   => $alertTimeMs ? Carbon::createFromTimestampMs((int) $alertTimeMs) : now(),
            'file_names'   => $data['file_names'],
            'longitude'    => $lng,
            'latitude'     => $lat,
            'status'       => $ok ? 'requested' : 'failed',
            'error'        => $ok ? null : ($result['message'] ?? 'Command failed.'),
            'requested_at' => now(),
        ]);

        return response()->json(['command' => $result, 'record' => $record]);
    }
}
