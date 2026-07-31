<?php

namespace App\Http\Controllers;

use App\Models\FuelAbnormalLossEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FuelAbnormalLossEventController extends Controller
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

        $query = FuelAbnormalLossEvent::orderByDesc('detected_at');

        if (!empty($data['imei'])) {
            $query->where('imei', $data['imei']);
        }
        if (!empty($data['startDate'])) {
            $query->where('detected_at', '>=', $data['startDate']);
        }
        if (!empty($data['endDate'])) {
            $query->where('detected_at', '<=', $data['endDate']);
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
