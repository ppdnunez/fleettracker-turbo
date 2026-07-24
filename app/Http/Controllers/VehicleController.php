<?php

namespace App\Http\Controllers;

use App\Models\Vehicle;
use Illuminate\Http\Request;

// FleetTrack's own vehicle registry (Fleet -> Vehicle). Binds a local vehicle profile (name,
// plate number, make/model/year/color) to a TurboHive IMEI — the local `vehicles` row is what
// makes an IMEI "linked" to a vehicle; any TurboHive trackable device not yet present here is
// offered as available in the Add Vehicle IMEI picker (see VehiclePage.jsx). Safety-sticker
// expiry, relay opt-in, and fuel settings stay on VehicleSetting (VehicleSettingController) —
// this controller only owns the vehicle's own identity fields.
class VehicleController extends Controller
{
    public function index()
    {
        return response()->json(Vehicle::orderBy('name')->get());
    }

    private function validationRules(): array
    {
        return [
            'imei'         => 'required|string|max:50',
            'name'         => 'required|string|max:100',
            'plate_number' => 'nullable|string|max:30',
            'manufacturer' => 'nullable|string|max:100',
            'model'        => 'nullable|string|max:100',
            'year'         => 'nullable|integer|min:1900|max:2100',
            'color'        => 'nullable|string|max:30',
            'status'       => 'nullable|in:Active,Inactive',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate(array_merge($this->validationRules(), [
            'imei' => 'required|string|max:50|unique:vehicles,imei',
        ]));

        $vehicle = Vehicle::create($data);

        return response()->json($vehicle, 201);
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $data = $request->validate($this->validationRules());

        if (trim($data['imei']) !== $vehicle->imei) {
            return response()->json(['message' => 'IMEI cannot be changed once the vehicle is created.'], 422);
        }

        $vehicle->update($data);

        return response()->json($vehicle);
    }

    public function destroy(Vehicle $vehicle)
    {
        $vehicle->delete();
        return response()->json(['message' => 'Vehicle deleted.']);
    }
}
