<?php

namespace App\Http\Controllers;

use App\Models\Driver;
use Illuminate\Http\Request;

// FleetTrack's own driver registry (Fleet -> Driver). The local `drivers` row is the source of
// truth for fleet-management fields (license, RFID/iButton card, register place, expiry dates,
// vehicle assignment via driver_device). Traccar sync has been removed — TurboHive is the sole
// GPS provider now (see routes/api.php's "Traccar routes disabled" note); the traccar_driver_id /
// traccar_unique_id columns are left in place but unused going forward.
class DriverController extends Controller
{
    public function index()
    {
        return response()->json(
            Driver::with('links')->orderBy('name')->get()->map(fn (Driver $d) => [
                ...$d->toArray(),
                'imeis' => $d->links->pluck('imei')->values(),
            ])
        );
    }

    private function validationRules(): array
    {
        return [
            'badge_no'              => 'required|string|max:50',
            'name'                  => 'required|string|max:100',
            'phone'                 => 'nullable|string|max:30',
            'license_no'            => 'nullable|string|max:50',
            'rfid_card_no'          => 'nullable|string|max:50',
            'ibutton_no'            => 'nullable|string|max:50',
            'register_place'        => 'nullable|string|max:100',
            'register_date'         => 'nullable|date',
            'license_expiry'        => 'nullable|date',
            'safety_sticker_expiry' => 'nullable|date',
            'notify_days_before'    => 'nullable|integer|min:1|max:365',
            'status'                => 'nullable|in:Active,Inactive',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate(array_merge($this->validationRules(), [
            'badge_no' => 'required|string|max:50|unique:drivers,badge_no',
        ]));

        $driver = Driver::create($data);

        return response()->json($driver, 201);
    }

    public function update(Request $request, Driver $driver)
    {
        $data = $request->validate($this->validationRules());

        if (trim($data['badge_no']) !== $driver->badge_no) {
            return response()->json(['message' => 'Driver No. cannot be changed once created.'], 422);
        }

        $driver->update($data);

        return response()->json($driver);
    }

    public function destroy(Driver $driver)
    {
        $driver->delete();
        return response()->json(['message' => 'Driver deleted.']);
    }
}
