<?php

namespace App\Services;

use App\Mail\UnregisteredDriverAlertMail;
use App\Models\AlertRecipient;
use App\Models\VehicleSetting;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Reacts to a "driver detected but not registered" event from either detection method this fleet
 * uses: an RFID/iButton check-in that didn't match any local Driver row (see
 * MqttWorker::connectAndListen's peri/dlt handler), or a JC171 AFIF face-recognition check that
 * came back with no match (alert.code 1824 — see services.turbohive.face_unrecognized_alert_code).
 * A relay disconnect (immobilizer) is sent whenever the vehicle has opted in
 * (VehicleSetting::relay_disconnect_enabled), with no stationary/ACC gate: the relay this command
 * drives is wired to the starter circuit only, used purely for cranking, not to ignition or fuel.
 * Cutting it while the engine is already running (ACC=1) does nothing to a moving vehicle — the
 * only effect is that the *next* start attempt won't crank. So there's nothing unsafe about firing
 * it unconditionally; gating on speed/ACC would only have delayed the immobilization until the
 * driver happened to stop, for no safety benefit. An email alert is always sent regardless, so the
 * event is never silent even if the relay command itself fails.
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
            $relayTriggered = $this->disconnectRelay($imei, $setting->relay_channel);
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
        $recipients = AlertRecipient::emailsFor('driver_checkin');
        if (empty($recipients)) {
            return;
        }

        try {
            foreach ($recipients as $to) {
                Mail::to($to)->send(new UnregisteredDriverAlertMail($imei, $identifier, $relayTriggered, $source));
            }
        } catch (\Throwable $e) {
            Log::warning('Unregistered driver alert email failed to send', [
                'to' => $recipients, 'imei' => $imei, 'error' => $e->getMessage(),
            ]);
        }
    }
}
