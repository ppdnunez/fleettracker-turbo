<?php

namespace App\Http\Controllers;

use App\Models\FuelAlert;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

// Read-only history of TurboHive fuel-sensor alerts (codes 1222-1225), captured live by
// MqttWorker::recordFuelAlert — see that method and FuelAlert's migration docblock. Mirrors
// FaceRecognitionEventController's filter-by-imei/date pattern.
class FuelAlertController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'      => 'nullable|string',
            'severity'  => 'nullable|in:low,medium,high',
            'startDate' => 'nullable|date',
            'endDate'   => 'nullable|date',
        ]);

        $query = FuelAlert::orderByDesc('occurred_at');

        if (!empty($data['imei'])) {
            $query->where('imei', $data['imei']);
        }
        if (!empty($data['severity'])) {
            $query->where('severity', $data['severity']);
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
