<?php

namespace App\Console\Commands;

use App\Mail\VehicleMaintenanceDueMail;
use App\Models\User;
use App\Models\VehicleMaintenance;
use App\Services\TurboHiveService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). For each Scheduled maintenance record, checks
// due_date and due_odometer_km against that record's notify thresholds (or the defaults below),
// and emails every registered FleetTrack user once either falls within its window. "Once" per due
// value is enforced via notified_due_date/notified_due_odometer_km — same pattern as
// Driver::license_notified_at (see the vehicle_maintenances migration's comment for why a notified
// *value* is stored rather than a boolean: editing the due date/odometer naturally re-arms it).
class NotifyVehicleMaintenanceDue extends Command
{
    protected $signature = 'vehicle-maintenance:notify-due';

    protected $description = 'Email registered users about vehicle maintenance due soon or overdue, by date or odometer';

    private const DEFAULT_NOTICE_DAYS = 14;
    private const DEFAULT_NOTICE_KM   = 500;

    public function handle(TurboHiveService $turboHive): int
    {
        $recipients = User::pluck('email')->filter()->all();
        if (empty($recipients)) {
            $this->info('No registered users to notify.');
            return self::SUCCESS;
        }

        $records = VehicleMaintenance::where('status', 'Scheduled')
            ->where(fn ($q) => $q->whereNotNull('due_date')->orWhereNotNull('due_odometer_km'))
            ->get();

        if ($records->isEmpty()) {
            $this->info('No scheduled maintenance with a due date/odometer.');
            return self::SUCCESS;
        }

        $odometerByImei = $this->currentOdometerByImei($turboHive);
        $today = Carbon::today();
        $sent = 0;

        foreach ($records as $record) {
            [$reasons, $notify] = $this->evaluate($record, $today, $odometerByImei[$record->imei] ?? null);
            if (empty($reasons)) {
                continue;
            }

            foreach ($recipients as $email) {
                Mail::to($email)->send(new VehicleMaintenanceDueMail($record, $reasons));
            }
            $record->update($notify);

            $sent++;
            $this->info("Notified: {$record->imei} - {$record->maintenance_type} (" . implode(', ', $reasons) . ')');
        }

        $this->info("Done. Sent {$sent} notice(s).");
        return self::SUCCESS;
    }

    /** @return array{0: string[], 1: array} [reasons to include in the email, columns to update] */
    private function evaluate(VehicleMaintenance $record, Carbon $today, ?float $currentOdometer): array
    {
        $reasons = [];
        $notify  = [];

        if ($record->due_date) {
            $daysUntil = (int) $today->diffInDays($record->due_date, false);
            $threshold = $record->notify_days_before ?? self::DEFAULT_NOTICE_DAYS;
            $alreadyNotified = $record->notified_due_date?->isSameDay($record->due_date) ?? false;

            if ($daysUntil <= $threshold && !$alreadyNotified) {
                $reasons[] = $daysUntil < 0 ? 'overdue by ' . abs($daysUntil) . ' day(s)' : "due in {$daysUntil} day(s)";
                $notify['notified_due_date'] = $record->due_date;
            }
        }

        if ($record->due_odometer_km !== null && $currentOdometer !== null) {
            $remaining = (float) $record->due_odometer_km - $currentOdometer;
            $threshold = $record->notify_km_before ?? self::DEFAULT_NOTICE_KM;
            $alreadyNotified = $record->notified_due_odometer_km !== null
                && (float) $record->notified_due_odometer_km === (float) $record->due_odometer_km;

            if ($remaining <= $threshold && !$alreadyNotified) {
                $reasons[] = $remaining < 0
                    ? 'overdue by ' . number_format(abs($remaining), 0) . ' km'
                    : number_format($remaining, 0) . ' km remaining';
                $notify['notified_due_odometer_km'] = $record->due_odometer_km;
            }
        }

        return [$reasons, $notify];
    }

    /**
     * One bulk TurboHive call rather than one per vehicle — mirrors the recommendation in
     * TurboHiveService::getRealtimeMileage's docblock. A fleet larger than one page (100) would
     * miss vehicles past the first page; acceptable for now, same limit other reports accept.
     */
    private function currentOdometerByImei(TurboHiveService $turboHive): array
    {
        $map = [];
        try {
            $result = $turboHive->getRealtimeMileage(['size' => 100]);
            foreach ($result['data'] ?? [] as $row) {
                if (!empty($row['imei'])) {
                    $map[$row['imei']] = (float) ($row['totalMileage'] ?? 0);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to fetch realtime mileage for maintenance reminders', ['error' => $e->getMessage()]);
        }

        return $map;
    }
}
