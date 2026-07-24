<?php

namespace App\Http\Controllers;

use App\Models\Geofence;
use App\Models\GeofenceDevice;
use Illuminate\Http\Request;

class GeofenceController extends Controller
{
    public function index()
    {
        return response()->json(
            Geofence::with('links')->get()->map(fn (Geofence $g) => [
                ...$g->toArray(),
                'imeis' => $g->links->pluck('imei')->values(),
                'links' => $g->links->map(fn (GeofenceDevice $l) => [
                    'imei'            => $l->imei,
                    'alert_direction' => $l->alert_direction,
                ])->values(),
            ])
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'area' => 'required|string',
        ]);

        return response()->json(Geofence::create($data), 201);
    }

    public function update(Request $request, Geofence $geofence)
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:100',
            'area' => 'sometimes|string',
        ]);

        $geofence->update($data);
        return response()->json($geofence);
    }

    public function destroy(Geofence $geofence)
    {
        $geofence->delete();
        return response()->json(['message' => 'Geofence deleted.']);
    }

    // ── Device links (mirrors Traccar's separate /api/permissions step) ──────

    public function linkDevice(Request $request, Geofence $geofence)
    {
        $data = $request->validate([
            'imei'            => 'required|string',
            'alert_direction' => 'nullable|in:enter,exit,both',
        ]);

        GeofenceDevice::firstOrCreate(
            ['geofence_id' => $geofence->id, 'imei' => $data['imei']],
            ['alert_direction' => $data['alert_direction'] ?? 'both'],
        );

        return response()->json(
            $geofence->links()->pluck('imei')->values()
        );
    }

    public function unlinkDevice(Geofence $geofence, string $imei)
    {
        $geofence->links()->where('imei', $imei)->delete();

        return response()->json(
            $geofence->links()->pluck('imei')->values()
        );
    }

    /** Changes an already-linked device's alert direction without unlinking/relinking it. */
    public function updateDeviceDirection(Request $request, Geofence $geofence, string $imei)
    {
        $data = $request->validate([
            'alert_direction' => 'required|in:enter,exit,both',
        ]);

        $link = $geofence->links()->where('imei', $imei)->firstOrFail();
        $link->update(['alert_direction' => $data['alert_direction']]);

        return response()->json([
            'imei'            => $link->imei,
            'alert_direction' => $link->alert_direction,
        ]);
    }
}
