<?php

namespace App\Mail;

use App\Models\VehicleSetting;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class SimDataExpiryNotice extends Mailable
{
    use SerializesModels;

    public function __construct(
        public VehicleSetting $setting,
        public Carbon $expiryDate,
        public int $daysUntil,
    ) {}

    public function envelope(): Envelope
    {
        $status = $this->daysUntil < 0 ? 'has expired' : 'is expiring soon';

        return new Envelope(
            subject: "SIM Card Data/Load {$status}: {$this->setting->imei}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.sim-data-expiry',
            with: [
                'setting'    => $this->setting,
                'expiryDate' => $this->expiryDate,
                'daysUntil'  => $this->daysUntil,
            ],
        );
    }
}
