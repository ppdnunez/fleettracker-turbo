<?php

namespace App\Mail;

use App\Models\GeofenceEvent;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent synchronously (no ShouldQueue) from GeofenceMonitorService::checkPosition — this project has
 * no jobs table or queue:work process running, so a queued Mailable would silently never send (the
 * same gap that previously affected ShouldBroadcast events; see DevicePositionUpdated).
 */
class GeofenceAlertMail extends Mailable
{
    use SerializesModels;

    public function __construct(
        public GeofenceEvent $event,
        public string $geofenceName,
        public ?string $deviceName = null,
    ) {}

    public function envelope(): Envelope
    {
        $action = $this->event->type === 'enter' ? 'entered' : 'exited';

        return new Envelope(
            subject: "Geofence Alert: {$this->label()} {$action} \"{$this->geofenceName}\"",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.geofence-alert',
            with: [
                'event'        => $this->event,
                'geofenceName' => $this->geofenceName,
                'deviceLabel'  => $this->label(),
            ],
        );
    }

    private function label(): string
    {
        return $this->deviceName ? "{$this->deviceName} ({$this->event->imei})" : $this->event->imei;
    }
}
