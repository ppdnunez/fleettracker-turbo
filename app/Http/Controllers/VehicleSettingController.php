<?php

namespace App\Http\Controllers;

use App\Models\VehicleSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Per-vehicle opt-in for the relay-disconnect behavior in UnregisteredDriverAlertService, plus the
// rate/tank-capacity inputs for the Fuel Management > Consumption tab's rate-based and
// sensor-based methods (see ReportPage.jsx's FuelConsumption component). Defaults are returned for
// a vehicle that has no row yet, so the frontend doesn't need to special-case "not configured".
class VehicleSettingController extends Controller
{
    public function show(string $imei): JsonResponse
    {
        $setting = VehicleSetting::where('imei', $imei)->first();

        return response()->json([
            'imei'                      => $imei,
            'relay_disconnect_enabled'  => $setting->relay_disconnect_enabled ?? false,
            'relay_channel'             => $setting->relay_channel ?? 10,
            'fuel_rate_l_per_100km'     => $setting->fuel_rate_l_per_100km ?? null,
            'fuel_tank_capacity_liters' => $setting->fuel_tank_capacity_liters ?? null,
        ]);
    }

    public function update(Request $request, string $imei): JsonResponse
    {
        $data = $request->validate([
            'relay_disconnect_enabled'  => 'required|boolean',
            'relay_channel'             => 'nullable|integer|min:1|max:255',
            'fuel_rate_l_per_100km'     => 'nullable|numeric|min:0|max:9999.99',
            'fuel_tank_capacity_liters' => 'nullable|numeric|min:0|max:99999.99',
        ]);

        $setting = VehicleSetting::updateOrCreate(
            ['imei' => $imei],
            [
                'relay_disconnect_enabled'  => $data['relay_disconnect_enabled'],
                'relay_channel'             => $data['relay_channel'] ?? 10,
                'fuel_rate_l_per_100km'     => $data['fuel_rate_l_per_100km'] ?? null,
                'fuel_tank_capacity_liters' => $data['fuel_tank_capacity_liters'] ?? null,
            ]
        );

        return response()->json($setting);
    }
}
