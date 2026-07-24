<?php

namespace App\Http\Controllers;

use App\Models\VehicleSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Per-vehicle opt-in for the relay-disconnect behavior in UnregisteredDriverAlertService, the
// rate/tank-capacity inputs for the Fuel Management > Consumption tab's rate-based and
// sensor-based methods (see ReportPage.jsx's FuelConsumption component), and the safety-inspection
// sticker expiry (moved here from Driver — see NotifyVehicleStickerExpirations). Defaults are
// returned for a vehicle that has no row yet, so the frontend doesn't need to special-case "not
// configured".
class VehicleSettingController extends Controller
{
    /**
     * Bulk list (imei, vehicle_type, safety sticker + SIM data fields) so the live map/device list
     * can merge vehicle-type icons, and the dashboard can compute sticker/SIM-expiry reminders, in
     * one request instead of one lookup per vehicle.
     */
    public function index(): JsonResponse
    {
        return response()->json(
            VehicleSetting::where(fn ($q) => $q->whereNotNull('vehicle_type')
                    ->orWhereNotNull('safety_sticker_expiry')
                    ->orWhereNotNull('sim_data_expiry'))
                ->get([
                    'imei', 'vehicle_type', 'safety_sticker_expiry', 'sticker_notify_days_before',
                    'sim_number', 'sim_data_expiry', 'sim_notify_days_before',
                ])
        );
    }

    public function show(string $imei): JsonResponse
    {
        $setting = VehicleSetting::where('imei', $imei)->first();

        return response()->json([
            'imei'                        => $imei,
            'relay_disconnect_enabled'    => $setting->relay_disconnect_enabled ?? false,
            'relay_disconnect_on_face_fail' => $setting->relay_disconnect_on_face_fail ?? false,
            'relay_channel'               => $setting->relay_channel ?? 10,
            'fuel_rate_l_per_100km'       => $setting->fuel_rate_l_per_100km ?? null,
            'fuel_tank_capacity_liters'   => $setting->fuel_tank_capacity_liters ?? null,
            'vehicle_type'                => $setting->vehicle_type ?? null,
            'fuel_type'                   => $setting->fuel_type ?? null,
            'safety_sticker_expiry'       => $setting->safety_sticker_expiry?->format('Y-m-d'),
            'sticker_notify_days_before'  => $setting->sticker_notify_days_before ?? null,
            'sim_number'                  => $setting->sim_number ?? null,
            'sim_data_expiry'             => $setting->sim_data_expiry?->format('Y-m-d'),
            'sim_notify_days_before'      => $setting->sim_notify_days_before ?? null,
        ]);
    }

    public function update(Request $request, string $imei): JsonResponse
    {
        $data = $request->validate([
            'relay_disconnect_enabled'   => 'required|boolean',
            'relay_disconnect_on_face_fail' => 'required|boolean',
            'relay_channel'              => 'nullable|integer|min:1|max:255',
            'fuel_rate_l_per_100km'      => 'nullable|numeric|min:0|max:9999.99',
            'fuel_tank_capacity_liters'  => 'nullable|numeric|min:0|max:99999.99',
            'vehicle_type'               => 'nullable|string|in:car,suv,truck,van,bus,motorcycle',
            'fuel_type'                  => 'nullable|string|in:petrol,diesel,electric,hybrid,lpg',
            'safety_sticker_expiry'      => 'nullable|date',
            'sticker_notify_days_before' => 'nullable|integer|min:1|max:365',
            'sim_number'                 => 'nullable|string|max:32',
            'sim_data_expiry'            => 'nullable|date',
            'sim_notify_days_before'     => 'nullable|integer|min:1|max:365',
        ]);

        $setting = VehicleSetting::updateOrCreate(
            ['imei' => $imei],
            [
                'relay_disconnect_enabled'   => $data['relay_disconnect_enabled'],
                'relay_disconnect_on_face_fail' => $data['relay_disconnect_on_face_fail'],
                'relay_channel'              => $data['relay_channel'] ?? 10,
                'fuel_rate_l_per_100km'      => $data['fuel_rate_l_per_100km'] ?? null,
                'fuel_tank_capacity_liters'  => $data['fuel_tank_capacity_liters'] ?? null,
                'vehicle_type'               => $data['vehicle_type'] ?? null,
                'fuel_type'                  => $data['fuel_type'] ?? null,
                'safety_sticker_expiry'      => $data['safety_sticker_expiry'] ?? null,
                'sticker_notify_days_before' => $data['sticker_notify_days_before'] ?? null,
                'sim_number'                 => $data['sim_number'] ?? null,
                'sim_data_expiry'            => $data['sim_data_expiry'] ?? null,
                'sim_notify_days_before'     => $data['sim_notify_days_before'] ?? null,
            ]
        );

        return response()->json($setting);
    }
}
