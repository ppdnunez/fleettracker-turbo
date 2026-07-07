<?php

namespace App\Http\Controllers;

use App\Models\DriverCheckin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverCheckinController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'      => 'nullable|string',
            'driverId'  => 'nullable|integer',
            'startDate' => 'nullable|date',
            'endDate'   => 'nullable|date',
            'page'      => 'nullable|integer|min:1',
            'size'      => 'nullable|integer|min:1|max:200',
        ]);

        $query = DriverCheckin::with('driver')->orderByDesc('checkin_time');

        if (!empty($data['imei'])) {
            $query->where('imei', $data['imei']);
        }
        if (!empty($data['driverId'])) {
            $query->where('driver_id', $data['driverId']);
        }
        if (!empty($data['startDate'])) {
            $query->where('checkin_time', '>=', $data['startDate']);
        }
        if (!empty($data['endDate'])) {
            $query->where('checkin_time', '<=', $data['endDate']);
        }

        $page = $data['page'] ?? 1;
        $size = $data['size'] ?? 50;
        $paginator = $query->paginate($size, ['*'], 'page', $page);

        return response()->json([
            'data'       => $paginator->items(),
            'page'       => $paginator->currentPage(),
            'size'       => $paginator->perPage(),
            'total'      => $paginator->total(),
            'totalPages' => $paginator->lastPage(),
        ]);
    }
}
