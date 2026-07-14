<?php

namespace App\Http\Controllers;

use App\Models\AlertFileUpload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Read-only tracking history for the alert-evidence upload round-trip (see MqttWorker's
// requestAlertFileUpload/recordUploadResult and the alert_file_uploads migration docblock).
// Nothing here is user-editable — every row is system-generated from MQTT traffic.
class AlertFileUploadController extends Controller
{
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
}
