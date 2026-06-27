<?php

namespace App\Mail;

use App\Models\Driver;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class DriverExpiryNotice extends Mailable
{
    use SerializesModels;

    public function __construct(
        public Driver $driver,
        public string $documentType, // 'License' or 'Safety Sticker'
        public Carbon $expiryDate,
        public int $daysUntil,
    ) {}

    public function envelope(): Envelope
    {
        $status = $this->daysUntil < 0 ? 'has expired' : 'is expiring soon';

        return new Envelope(
            subject: "{$this->documentType} {$status}: {$this->driver->name} ({$this->driver->badge_no})",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.driver-expiry',
            with: [
                'driver'       => $this->driver,
                'documentType' => $this->documentType,
                'expiryDate'   => $this->expiryDate,
                'daysUntil'    => $this->daysUntil,
            ],
        );
    }
}
