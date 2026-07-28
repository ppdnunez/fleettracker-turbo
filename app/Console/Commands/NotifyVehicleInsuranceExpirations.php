<?php

namespace App\Console\Commands;

use App\Mail\VehicleInsuranceExpiryNotice;
use App\Models\AlertRecipient;
use App\Models\VehicleSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). Same shape as NotifyVehicleStickerExpirations, just
// for insurance_expiry/insurance_notify_days_before/insurance_notified_at instead of the sticker
// fields, and the 'vehicle_insurance_expiry' AlertRecipient category instead of 'vehicle_expiry'.
class NotifyVehicleInsuranceExpirations extends Command
{
    protected $signature = 'vehicles:notify-insurance-expirations';

    protected $description = 'Email registered users about vehicles with an upcoming or past insurance expiry';

    private const DEFAULT_NOTICE_DAYS = 14;

    public function handle(): int
    {
        $recipients = AlertRecipient::emailsFor('vehicle_insurance_expiry');
        if (empty($recipients)) {
            $this->info('No recipients subscribed to vehicle_insurance_expiry alerts.');
            return self::SUCCESS;
        }

        $today = Carbon::today();
        $sent  = 0;

        $settings = VehicleSetting::whereNotNull('insurance_expiry')->get();

        foreach ($settings as $setting) {
            $expiry    = $setting->insurance_expiry;
            $threshold = $setting->insurance_notify_days_before ?? self::DEFAULT_NOTICE_DAYS;
            $daysUntil = (int) $today->diffInDays($expiry, false);

            $alreadyNotified = $setting->insurance_notified_at?->isSameDay($expiry) ?? false;

            if ($daysUntil > $threshold || $alreadyNotified) {
                continue;
            }

            foreach ($recipients as $email) {
                Mail::to($email)->send(new VehicleInsuranceExpiryNotice($setting, $expiry, $daysUntil));
            }
            $setting->update(['insurance_notified_at' => $expiry]);

            $sent++;
            $this->info("Notified for Insurance - {$setting->imei}, {$daysUntil} day(s).");
        }

        $this->info("Done. Sent {$sent} notice(s).");
        return self::SUCCESS;
    }
}
