<?php

namespace App\Console\Commands;

use App\Models\Driver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

// Safety net for drivers:sync-to-traccar — DriverController::store() already syncs new drivers
// inside a DB transaction (rolling back locally if the Traccar call fails), so this is only
// needed for rows that predate that sync step or whose earlier sync attempt failed outright.
class SyncDriversToTraccar extends Command
{
    protected $signature = 'drivers:sync-to-traccar';

    protected $description = 'Create a matching Traccar driver for any local driver missing a traccar_driver_id';

    public function handle(): int
    {
        $baseUrl = rtrim(config('services.traccar.url'), '/') . '/api';
        $auth    = [config('services.traccar.email'), config('services.traccar.password')];

        $drivers = Driver::whereNull('traccar_driver_id')->get();

        if ($drivers->isEmpty()) {
            $this->info('All drivers are already synced.');
            return self::SUCCESS;
        }

        foreach ($drivers as $driver) {
            $response = Http::withBasicAuth(...$auth)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post("{$baseUrl}/drivers", [
                    'name'       => $driver->name,
                    'uniqueId'   => $driver->badge_no,
                    'attributes' => (object) [],
                ]);

            if (!$response->successful()) {
                $this->error("Failed to sync {$driver->name} ({$driver->badge_no}): HTTP {$response->status()}");
                continue;
            }

            $traccarDriver = $response->json();
            $driver->update([
                'traccar_driver_id' => $traccarDriver['id'],
                'traccar_unique_id' => $traccarDriver['uniqueId'],
            ]);
            $this->info("Synced driver: {$driver->name}");
        }

        return self::SUCCESS;
    }
}
