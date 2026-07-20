<?php

namespace App\Services;

use App\Mail\UnregisteredDriverAlertMail;
use App\Models\VehicleSetting;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Reacts to a "driver detected but not registered" event from either detection method this fleet
 * uses: an RFID/iButton check-in that didn't match any local Driver row (see
 * MqttWorker::connectAndListen's peri/dlt handler), or a JC171 AFIF face-recognition check that
 * came back with no match (alert.code 1824 — see services.turbohive.face_unrecognized_alert_code).
 * A relay disconnect (immobilizer) is only sent if the vehicle has explicitly opted in
 * (VehicleSetting::relay_disconnect_enabled) AND is confirmed stationary — cutting power to a
 * moving vehicle is unsafe, so an unconfirmed state skips the relay command entirely. An email
 * alert is always sent regardless, so the event is never silent even when the relay doesn't fire.
 *
 * "Stationary" is resolved with a live TurboHiveService::getDeviceLocation() call at the moment of
 * the event rather than MqttWorker's passively-cached last-known speed — some devices (confirmed
 * live) never publish a usable gnss.speed at all, over MQTT or REST, which would make the relay
 * permanently unreachable for them under a speed-only check. status.acc (ignition state) is
 * checked as an equally-valid signal: ACC off means the vehicle cannot be in motion regardless of
 * whether a speed reading exists.
 */
class UnregisteredDriverAlertService
{
    public function __construct(private TurboHiveService $turboHive)
    {
    }

    /** @param string $source 'rfid' or 'face' — only used to label the email alert. */
    public function handle(string $imei, string $identifier, string $source = 'rfid'): void
    {
        $setting = VehicleSetting::where('imei', $imei)->first();
        $relayTriggered = false;

        if ($setting?->relay_disconnect_enabled) {
            [$stationary, $reading] = $this->isConfirmedStationary($imei);

            if ($stationary) {
                $relayTriggered = $this->disconnectRelay($imei, $setting->relay_channel);
            } else {
                Log::info('Skipped relay disconnect for unregistered driver — vehicle not confirmed stationary', [
                    'imei' => $imei, 'source' => $source, 'reading' => $reading,
                ]);
            }
        }

        $this->sendAlertEmail($imei, $identifier, $relayTriggered, $source);
    }

    /**
     * @return array{0: bool, 1: array} [stationary?, the speed/acc values used for the decision —
     *                                    logged either way so a "not stationary" skip is debuggable]
     */
    private function isConfirmedStationary(string $imei): array
    {
        try {
            $location = $this->turboHive->getDeviceLocation($imei);
        } catch (\Throwable $e) {
            Log::warning('Failed to fetch device location for stationary check', [
                'imei' => $imei, 'error' => $e->getMessage(),
            ]);
            return [false, ['error' => $e->getMessage()]];
        }

        $speedRaw = $location['gnss.speed'] ?? $location['speed'] ?? $location['spd'] ?? null;
        $accRaw   = $location['status.acc'] ?? $location['device.acc'] ?? $location['io.acc'] ?? $location['acc'] ?? $location['ignition'] ?? null;

        $speed = $speedRaw !== null ? (float) $speedRaw : null;
        $acc   = $accRaw !== null ? (int) $accRaw : null;

        $stationary = ($speed !== null && $speed <= 0) || ($acc !== null && $acc === 0);

        return [$stationary, ['speed' => $speed, 'acc' => $acc]];
    }

    private function disconnectRelay(string $imei, int $channel): bool
    {
        try {
            $result = $this->turboHive->disconnectRelay($imei, $channel);
            return (int) ($result['code'] ?? 0) === 1000;
        } catch (\Throwable $e) {
            Log::warning('Relay disconnect command failed for unregistered driver', [
                'imei' => $imei, 'error' => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Sent synchronously (UnregisteredDriverAlertMail has no ShouldQueue — see its docblock). A
     * delivery failure is logged rather than thrown, since it shouldn't interrupt live MQTT
     * processing for the check-in that's currently being handled.
     */
    private function sendAlertEmail(string $imei, string $identifier, bool $relayTriggered, string $source): void
    {
        $to = config('services.driver_checkin.alert_email');
        if (!$to) {
            return;
        }

        try {
            Mail::to($to)->send(new UnregisteredDriverAlertMail($imei, $identifier, $relayTriggered, $source));
        } catch (\Throwable $e) {
            Log::warning('Unregistered driver alert email failed to send', [
                'to' => $to, 'imei' => $imei, 'error' => $e->getMessage(),
            ]);
        }
    }
}
