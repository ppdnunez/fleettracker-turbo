<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent synchronously (no ShouldQueue) from UnregisteredDriverAlertService — this project has no
 * jobs table or queue:work process running, so a queued Mailable would silently never send (same
 * gap noted on GeofenceAlertMail).
 */
class UnregisteredDriverAlertMail extends Mailable
{
    use SerializesModels;

    /** @param string $source 'rfid' or 'face' */
    public function __construct(
        public string $imei,
        public string $cardId,
        public bool $relayTriggered,
        public string $source = 'rfid',
    ) {}

    public function envelope(): Envelope
    {
        $method  = $this->source === 'face' ? 'Face Recognition' : 'RFID/iButton';
        $subject = "Unregistered Driver Alert ({$method}) — {$this->imei}";
        if ($this->relayTriggered) {
            $subject .= ' (vehicle disconnected)';
        }

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.unregistered-driver-alert',
            with: [
                'imei'           => $this->imei,
                'cardId'         => $this->cardId,
                'relayTriggered' => $this->relayTriggered,
                'source'         => $this->source,
            ],
        );
    }
}
