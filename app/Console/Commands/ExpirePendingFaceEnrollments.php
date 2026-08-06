<?php

namespace App\Console\Commands;

use App\Models\DriverFace;
use Illuminate\Console\Command;

// Scheduled every minute (see routes/console.php). A SHOT enrollment only leaves 'pending' when
// MqttWorker::recordFaceShotResult() sees the device's result on {userId}/notify/# — if the device
// never responds (offline, command dropped) or the notify message never arrives (worker down),
// nothing would ever flip it, leaving the UI stuck on "pending" forever. This gives it a ceiling.
class ExpirePendingFaceEnrollments extends Command
{
    protected $signature = 'face-enrollments:expire-pending';

    protected $description = 'Mark face enrollments that have been pending too long as failed';

    /** Roughly the device's own SHOT response window — see MqttWorker::recordFaceShotResult()'s docblock. */
    private const TIMEOUT_MINUTES = 3;

    public function handle(): int
    {
        $stale = DriverFace::where('status', 'pending')
            ->where('requested_at', '<=', now()->subMinutes(self::TIMEOUT_MINUTES))
            ->get();

        foreach ($stale as $face) {
            $face->update([
                'status' => 'failed',
                'error'  => 'Timed out waiting for device confirmation.',
            ]);
            $this->line("Expired pending enrollment for driver #{$face->driver_id} ({$face->imei}).");
        }

        return self::SUCCESS;
    }
}
