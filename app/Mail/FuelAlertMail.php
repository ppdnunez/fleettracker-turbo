<?php

namespace App\Mail;

use App\Models\FuelAlert;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent synchronously (no ShouldQueue — see GeofenceAlertMail's docblock for why) from
 * MqttWorker::recordFuelAlert, only for the "loss/drop" subset of fuel alerts (codes 1223/1225 —
 * see MqttWorker::FUEL_LOSS_ALERT_CODES), not every fuel alert (e.g. Low Fuel/1222 is routine, not
 * something worth paging someone about).
 */
class FuelAlertMail extends Mailable
{
    use SerializesModels;

    public function __construct(
        public FuelAlert $alert,
        public ?string $deviceName = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Fuel Alert: {$this->alert->type} — {$this->label()}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.fuel-alert',
            with: [
                'alert'      => $this->alert,
                'deviceLabel' => $this->label(),
            ],
        );
    }

    private function label(): string
    {
        return $this->deviceName ? "{$this->deviceName} ({$this->alert->imei})" : $this->alert->imei;
    }
}
