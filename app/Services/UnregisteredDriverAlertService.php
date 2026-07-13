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
 * came back with no match (see the alert/# handler, gated behind
 * services.turbohive.face_unrecognized_alert_code since that alert.code isn't vendor-confirmed
 * yet). A relay disconnect (immobilizer) is only sent if the vehicle has explicitly opted in
 * (VehicleSetting::relay_disconnect_enabled) AND is confirmed stationary (speed <= 0) — cutting
 * power to a moving vehicle is unsafe, so an unknown or nonzero speed skips the relay command
 * entirely. An email alert is always sent regardless, so the event is never silent even when the
 * relay doesn't fire.
 */
class UnregisteredDriverAlertService
{
    public function __construct(private TurboHiveService $turboHive)
    {
    }

    /** @param string $source 'rfid' or 'face' — only used to label the email alert. */
    public function handle(string $imei, string $identifier, ?float $speed, string $source = 'rfid'): void
    {
        $setting = VehicleSetting::where('imei', $imei)->first();
        $relayTriggered = false;

        if ($setting?->relay_disconnect_enabled) {
            if ($speed !== null && $speed <= 0) {
                $relayTriggered = $this->disconnectRelay($imei, $setting->relay_channel);
            } else {
                Log::info('Skipped relay disconnect for unregistered driver — vehicle not confirmed stationary', [
                    'imei' => $imei, 'source' => $source, 'speed' => $speed,
                ]);
            }
        }

        $this->sendAlertEmail($imei, $identifier, $relayTriggered, $source);
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
