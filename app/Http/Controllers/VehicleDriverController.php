<?php

namespace App\Http\Controllers;

use App\Models\Driver;
use App\Models\DriverDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Manages which drivers are assigned to a vehicle (TurboHive device, identified by IMEI — not a
// local `devices` row, mirrors GeofenceController's device-linking convention). A vehicle can
// have multiple drivers assigned at once (e.g. shift-based driving).
class VehicleDriverController extends Controller
{
    public function index(string $imei): JsonResponse
    {
        return response()->json(
            Driver::whereHas('links', fn ($q) => $q->where('imei', $imei))
                ->orderBy('name')
                ->get()
        );
    }

    public function sync(Request $request, string $imei): JsonResponse
    {
        $data = $request->validate([
            'driverIds'   => 'array',
            'driverIds.*' => 'integer|exists:drivers,id',
        ]);

        DriverDevice::where('imei', $imei)->delete();

        foreach (array_unique($data['driverIds'] ?? []) as $driverId) {
            DriverDevice::create(['driver_id' => $driverId, 'imei' => $imei]);
        }

        return response()->json(
            Driver::whereHas('links', fn ($q) => $q->where('imei', $imei))
                ->orderBy('name')
                ->get()
        );
    }
}
