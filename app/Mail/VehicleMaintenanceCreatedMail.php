<?php

namespace App\Mail;

use App\Models\VehicleMaintenance;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent synchronously (no ShouldQueue) from VehicleMaintenanceController::store — this project has
 * no jobs table or queue:work process running (same gap noted on DriverExpiryNotice/GeofenceAlertMail).
 * Confirms a new maintenance record the moment it's scheduled, rather than staying silent until
 * VehicleMaintenanceDueMail fires near the due date/odometer.
 */
class VehicleMaintenanceCreatedMail extends Mailable
{
    use SerializesModels;

    public function __construct(public VehicleMaintenance $record)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Maintenance Scheduled: {$this->record->maintenance_type} — {$this->record->imei}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.vehicle-maintenance-created',
            with: ['record' => $this->record],
        );
    }
}
