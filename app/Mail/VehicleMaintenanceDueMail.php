<?php

namespace App\Mail;

use App\Models\VehicleMaintenance;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent synchronously (no ShouldQueue) from NotifyVehicleMaintenanceDue — this project has no jobs
 * table or queue:work process running (same gap noted on DriverExpiryNotice/GeofenceAlertMail).
 */
class VehicleMaintenanceDueMail extends Mailable
{
    use SerializesModels;

    /** @param string[] $reasons e.g. ["due in 5 day(s)", "320 km remaining"] */
    public function __construct(
        public VehicleMaintenance $record,
        public array $reasons,
    ) {}

    public function envelope(): Envelope
    {
        $overdue = collect($this->reasons)->contains(fn ($r) => str_contains($r, 'overdue'));

        return new Envelope(
            subject: ($overdue ? 'Overdue: ' : 'Due Soon: ') . "{$this->record->maintenance_type} — {$this->record->imei}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.vehicle-maintenance-due',
            with: [
                'record'  => $this->record,
                'reasons' => $this->reasons,
            ],
        );
    }
}
