<?php

namespace App\Http\Controllers;

use App\Models\Driver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

// FleetTrack's own driver registry (Fleet -> Driver), distinct from the bare Traccar-only driver
// CRUD at /api/traccar/drivers (DriverPage.jsx / TraccarController). This is "Approach 2": the
// local `drivers` row is the source of truth for fleet-management fields Traccar doesn't have
// (license, RFID card, register place, expiry dates), and a matching Traccar driver (name +
// uniqueId=badge_no) is created/kept in sync so the device <-> driver link still works through
// Traccar's existing permission/attribute mechanisms elsewhere in the app.
class DriverController extends Controller
{
    private string $baseUrl;
    private array  $auth;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.traccar.url'), '/') . '/api';
        $this->auth    = [
            config('services.traccar.email'),
            config('services.traccar.password'),
        ];
    }

    public function index()
    {
        return response()->json(Driver::orderBy('name')->get());
    }

    private function validationRules(): array
    {
        return [
            'badge_no'              => 'required|string|max:50',
            'name'                  => 'required|string|max:100',
            'phone'                 => 'nullable|string|max:30',
            'license_no'            => 'nullable|string|max:50',
            'rfid_card_no'          => 'nullable|string|max:50',
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

        return DB::transaction(function () use ($data) {
            $driver = Driver::create($data);

            $traccarResponse = Http::withBasicAuth(...$this->auth)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post("{$this->baseUrl}/drivers", [
                    'name'       => $driver->name,
                    'uniqueId'   => $driver->badge_no,
                    'attributes' => (object) [],
                ]);

            if (!$traccarResponse->successful()) {
                DB::rollBack();
                return response()->json(['message' => 'Failed to sync driver to Traccar.'], 502);
            }

            $traccarDriver = $traccarResponse->json();
            $driver->update([
                'traccar_driver_id' => $traccarDriver['id'],
                'traccar_unique_id' => $traccarDriver['uniqueId'],
            ]);

            return response()->json($driver, 201);
        });
    }

    public function update(Request $request, Driver $driver)
    {
        $data = $request->validate($this->validationRules());

        if (trim($data['badge_no']) !== $driver->badge_no) {
            return response()->json(['message' => 'Driver No. cannot be changed once created.'], 422);
        }

        $driver->update($data);

        if ($driver->traccar_driver_id) {
            Http::withBasicAuth(...$this->auth)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->put("{$this->baseUrl}/drivers/{$driver->traccar_driver_id}", [
                    'id'         => $driver->traccar_driver_id,
                    'name'       => $driver->name,
                    'uniqueId'   => $driver->traccar_unique_id,
                    'attributes' => (object) [],
                ]);
        }

        return response()->json($driver);
    }

    public function destroy(Driver $driver)
    {
        if ($driver->traccar_driver_id) {
            $response = Http::withBasicAuth(...$this->auth)
                ->delete("{$this->baseUrl}/drivers/{$driver->traccar_driver_id}");
            if (!$response->successful() && $response->status() !== 404) {
                return response()->json(['message' => 'Failed to remove driver from Traccar.'], 502);
            }
        }

        $driver->delete();
        return response()->json(['message' => 'Driver deleted.']);
    }
}
