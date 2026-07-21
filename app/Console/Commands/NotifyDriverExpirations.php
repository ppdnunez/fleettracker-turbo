<?php

namespace App\Console\Commands;

use App\Mail\DriverExpiryNotice;
use App\Models\AlertRecipient;
use App\Models\Driver;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). For each driver, checks license_expiry and
// safety_sticker_expiry against that driver's notify_days_before (or DEFAULT_NOTICE_DAYS),
// and emails every AlertRecipient subscribed to the 'driver_expiry' category once the expiry
// falls within that window. "Once" per expiry date is enforced via {license,sticker}_notified_at
// — see the migration comment on those columns for why a notified date is stored rather than a
// boolean.
class NotifyDriverExpirations extends Command
{
    protected $signature = 'drivers:notify-expirations';

    protected $description = 'Email registered users about drivers with an upcoming or past license/safety-sticker expiry';

    private const DEFAULT_NOTICE_DAYS = 14;

    public function handle(): int
    {
        $recipients = AlertRecipient::emailsFor('driver_expiry');
        if (empty($recipients)) {
            $this->info('No recipients subscribed to driver_expiry alerts.');
            return self::SUCCESS;
        }

        $today = Carbon::today();
        $checks = [
            ['field' => 'license_expiry', 'notifiedField' => 'license_notified_at', 'label' => 'License'],
            ['field' => 'safety_sticker_expiry', 'notifiedField' => 'sticker_notified_at', 'label' => 'Safety Sticker'],
        ];

        $sent = 0;
        foreach ($checks as $check) {
            $drivers = Driver::whereNotNull($check['field'])->get();

            foreach ($drivers as $driver) {
                $expiry    = $driver->{$check['field']};
                $threshold = $driver->notify_days_before ?? self::DEFAULT_NOTICE_DAYS;
                $daysUntil = (int) $today->diffInDays($expiry, false);

                $alreadyNotified = $driver->{$check['notifiedField']}?->isSameDay($expiry) ?? false;

                if ($daysUntil > $threshold || $alreadyNotified) {
                    continue;
                }

                foreach ($recipients as $email) {
                    Mail::to($email)->send(new DriverExpiryNotice($driver, $check['label'], $expiry, $daysUntil));
                }
                $driver->update([$check['notifiedField'] => $expiry]);

                $sent++;
                $this->info("Notified for {$check['label']} - {$driver->name} ({$driver->badge_no}), {$daysUntil} day(s).");
            }
        }

        $this->info("Done. Sent {$sent} notice(s).");
        return self::SUCCESS;
    }
}
