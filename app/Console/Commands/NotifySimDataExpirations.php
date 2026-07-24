<?php

namespace App\Console\Commands;

use App\Mail\SimDataExpiryNotice;
use App\Models\AlertRecipient;
use App\Models\VehicleSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). For each VehicleSetting row, checks sim_data_expiry
// against that vehicle's sim_notify_days_before (or DEFAULT_NOTICE_DAYS), and emails every
// AlertRecipient subscribed to the 'sim_expiry' category once the expiry falls within that
// window. "Once" per expiry date is enforced via sim_notified_at — same dedup-by-value pattern as
// NotifyVehicleStickerExpirations's sticker_notified_at.
class NotifySimDataExpirations extends Command
{
    protected $signature = 'sim:notify-expirations';

    protected $description = "Email registered users about vehicles with an upcoming or past SIM card data/load expiry";

    private const DEFAULT_NOTICE_DAYS = 14;

    public function handle(): int
    {
        $recipients = AlertRecipient::emailsFor('sim_expiry');
        if (empty($recipients)) {
            $this->info('No recipients subscribed to sim_expiry alerts.');
            return self::SUCCESS;
        }

        $today = Carbon::today();
        $sent  = 0;

        $settings = VehicleSetting::whereNotNull('sim_data_expiry')->get();

        foreach ($settings as $setting) {
            $expiry    = $setting->sim_data_expiry;
            $threshold = $setting->sim_notify_days_before ?? self::DEFAULT_NOTICE_DAYS;
            $daysUntil = (int) $today->diffInDays($expiry, false);

            $alreadyNotified = $setting->sim_notified_at?->isSameDay($expiry) ?? false;

            if ($daysUntil > $threshold || $alreadyNotified) {
                continue;
            }

            foreach ($recipients as $email) {
                Mail::to($email)->send(new SimDataExpiryNotice($setting, $expiry, $daysUntil));
            }
            $setting->update(['sim_notified_at' => $expiry]);

            $sent++;
            $this->info("Notified for SIM Data - {$setting->imei}, {$daysUntil} day(s).");
        }

        $this->info("Done. Sent {$sent} notice(s).");
        return self::SUCCESS;
    }
}
