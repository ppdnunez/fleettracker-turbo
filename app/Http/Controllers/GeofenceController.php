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
        $data = $request->validate(['imei' => 'required|string']);

        GeofenceDevice::firstOrCreate([
            'geofence_id' => $geofence->id,
            'imei'        => $data['imei'],
        ]);

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
}
