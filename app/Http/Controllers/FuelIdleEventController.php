<?php

namespace App\Http\Controllers;

use App\Models\FuelIdleEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FuelIdleEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'      => 'nullable|string',
            'startDate' => 'nullable|date',
            'endDate'   => 'nullable|date',
            'page'      => 'nullable|integer|min:1',
            'size'      => 'nullable|integer|min:1|max:200',
        ]);

        $query = FuelIdleEvent::orderByDesc('start_time');

        if (!empty($data['imei'])) {
            $query->where('imei', $data['imei']);
        }
        if (!empty($data['startDate'])) {
            $query->where('start_time', '>=', $data['startDate']);
        }
        if (!empty($data['endDate'])) {
            $query->where('start_time', '<=', $data['endDate']);
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
