<?php

namespace App\Http\Controllers;

use App\Models\FaceRecognitionEvent;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

// Read-only history of JC171 AFIF face-recognition checks (alert.code 1823/1824), captured live
// by MqttWorker::recordFaceRecognitionEvent — see that method and FaceRecognitionEvent's migration
// docblock. Mirrors AlertFileUploadController's filter-by-imei/limit pattern.
class FaceRecognitionEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'      => 'nullable|string',
            'result'    => 'nullable|in:succeeded,failed',
            'driverId'  => 'nullable|integer',
            'startDate' => 'nullable|date',
            'endDate'   => 'nullable|date',
        ]);

        $query = FaceRecognitionEvent::with('driver:id,name,badge_no')->orderByDesc('occurred_at');

        if (!empty($data['imei'])) {
            $query->where('imei', $data['imei']);
        }
        if (!empty($data['result'])) {
            $query->where('result', $data['result']);
        }
        if (!empty($data['driverId'])) {
            $query->where('driver_id', $data['driverId']);
        }
        if (!empty($data['startDate'])) {
            $query->where('occurred_at', '>=', $data['startDate']);
        }
        if (!empty($data['endDate'])) {
            $query->where('occurred_at', '<=', $data['endDate']);
        }

        return response()->json($query->limit(200)->get());
    }
}
