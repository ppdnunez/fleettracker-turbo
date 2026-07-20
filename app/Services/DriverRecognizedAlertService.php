<?php

namespace App\Services;

use App\Models\VehicleSetting;
use Illuminate\Support\Facades\Log;

/**
 * Reacts to a JC171 AFIF face-recognition success (alert.code 1823 — see
 * services.turbohive.face_recognized_alert_code) by reconnecting the relay for any vehicle that
 * has opted into the disconnect/reconnect feature (VehicleSetting::relay_disconnect_enabled) — the
 * complement to UnregisteredDriverAlertService's disconnect on a failed check.
 *
 * Fires unconditionally on every success event for an opted-in vehicle: no stationary gate (unlike
 * disconnecting, restoring power is safe at any time) and no "was it actually disconnected"
 * tracking (reconnecting an already-connected relay is a harmless no-op on the device, and this
 * avoids reasoning about drift from a manual reconnect done outside the app).
 */
class DriverRecognizedAlertService
{
    public function __construct(private TurboHiveService $turboHive)
    {
    }

    public function handle(string $imei): void
    {
        $setting = VehicleSetting::where('imei', $imei)->first();
        if (!$setting?->relay_disconnect_enabled) {
            return;
        }

        try {
            $result = $this->turboHive->connectRelay($imei, $setting->relay_channel);
            $ok = (int) ($result['code'] ?? 0) === 1000;

            Log::info('Relay reconnect sent for recognized driver', ['imei' => $imei, 'success' => $ok]);
        } catch (\Throwable $e) {
            Log::warning('Relay reconnect command failed for recognized driver', [
                'imei' => $imei, 'error' => $e->getMessage(),
            ]);
        }
    }
}
