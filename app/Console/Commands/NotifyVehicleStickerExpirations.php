<?php

namespace App\Console\Commands;

use App\Mail\VehicleStickerExpiryNotice;
use App\Models\AlertRecipient;
use App\Models\VehicleSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). For each VehicleSetting row, checks
// safety_sticker_expiry against that vehicle's sticker_notify_days_before (or
// DEFAULT_NOTICE_DAYS), and emails every AlertRecipient subscribed to the 'vehicle_expiry'
// category once the expiry falls within that window. "Once" per expiry date is enforced via
// sticker_notified_at — same dedup-by-value pattern as Driver::license_notified_at. Split out from
// NotifyDriverExpirations once safety stickers moved from Driver to VehicleSetting (per-IMEI).
class NotifyVehicleStickerExpirations extends Command
{
    protected $signature = 'vehicles:notify-sticker-expirations';

    protected $description = 'Email registered users about vehicles with an upcoming or past safety-sticker expiry';

    private const DEFAULT_NOTICE_DAYS = 14;

    public function handle(): int
    {
        $recipients = AlertRecipient::emailsFor('vehicle_expiry');
        if (empty($recipients)) {
            $this->info('No recipients subscribed to vehicle_expiry alerts.');
            return self::SUCCESS;
        }

        $today = Carbon::today();
        $sent  = 0;

        $settings = VehicleSetting::whereNotNull('safety_sticker_expiry')->get();

        foreach ($settings as $setting) {
            $expiry    = $setting->safety_sticker_expiry;
            $threshold = $setting->sticker_notify_days_before ?? self::DEFAULT_NOTICE_DAYS;
            $daysUntil = (int) $today->diffInDays($expiry, false);

            $alreadyNotified = $setting->sticker_notified_at?->isSameDay($expiry) ?? false;

            if ($daysUntil > $threshold || $alreadyNotified) {
                continue;
            }

            foreach ($recipients as $email) {
                Mail::to($email)->send(new VehicleStickerExpiryNotice($setting, $expiry, $daysUntil));
            }
            $setting->update(['sticker_notified_at' => $expiry]);

            $sent++;
            $this->info("Notified for Safety Sticker - {$setting->imei}, {$daysUntil} day(s).");
        }

        $this->info("Done. Sent {$sent} notice(s).");
        return self::SUCCESS;
    }
}
