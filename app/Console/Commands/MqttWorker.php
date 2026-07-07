<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;
use App\Events\DevicePositionUpdated;
use App\Events\DeviceAlertReceived;
use App\Events\DeviceSensorUpdated;
use App\Events\DriverCheckedIn;
use App\Models\Driver;
use App\Models\DriverCheckin;
use App\Services\GeofenceMonitorService;
use Carbon\Carbon;

class MqttWorker extends Command
{
    protected $signature   = 'mqtt:worker';
    protected $description = 'Listen to TurboHive MQTT and broadcast device positions to frontend';

    /** Reset to the minimum after any connection that survives long enough to be considered
     *  "healthy", so a brief blip doesn't leave future reconnects waiting on a stale long delay. */
    private const MIN_BACKOFF_SECONDS = 3;
    private const MAX_BACKOFF_SECONDS = 60;
    private const HEALTHY_AFTER_SECONDS = 30;

    /**
     * php-mqtt/client's own setReconnectAutomatically() only covers transport-level resends, not
     * every failure mode — a broken socket during publish/loop (DataTransferException) is thrown
     * all the way up and previously killed this whole command, silently ending live position/
     * alert/sensor broadcasting until someone noticed and reran `artisan mqtt:worker` by hand.
     * This wraps the entire connect+subscribe+loop cycle in a retry loop with backoff, so the
     * command itself never exits on a connection failure — only Ctrl+C / process kill stops it.
     */
    public function handle(GeofenceMonitorService $geofenceMonitor): void
    {
        $cfg    = config('services.turbohive_mqtt');
        $userId = $cfg['user_id'];
        $backoff = self::MIN_BACKOFF_SECONDS;

        while (true) {
            $connectedAt = microtime(true);

            try {
                $this->connectAndListen($cfg, $userId, $geofenceMonitor);
            } catch (\Throwable $e) {
                $this->error("MQTT worker connection lost: {$e->getMessage()}");
                Log::warning('mqtt:worker connection lost, will reconnect', [
                    'error' => $e->getMessage(),
                ]);
            }

            $backoff = (microtime(true) - $connectedAt) >= self::HEALTHY_AFTER_SECONDS
                ? self::MIN_BACKOFF_SECONDS
                : min($backoff * 2, self::MAX_BACKOFF_SECONDS);

            $this->warn("Reconnecting in {$backoff}s…");
            sleep($backoff);
        }
    }

    /** @throws \Throwable on any connection/subscribe/loop failure — caller retries. */
    private function connectAndListen(array $cfg, string $userId, GeofenceMonitorService $geofenceMonitor): void
    {
        $this->info("Connecting to {$cfg['host']}:{$cfg['port']} as {$cfg['username']}…");

        $mqtt = new MqttClient($cfg['host'], (int) $cfg['port'], $cfg['client_id']);

        $settings = (new ConnectionSettings)
            ->setUsername($cfg['username'])
            ->setPassword($cfg['password'])
            ->setKeepAliveInterval(60)
            ->setReconnectAutomatically(true);

        // false = persistent session (required when using auto-reconnect)
        $mqtt->connect($settings, false);

        $this->info('MQTT connected. Listening for device data…');

        // All device locations: {userId}/location/gnss/{imei}
        $mqtt->subscribe("{$userId}/location/gnss/#", function (string $topic, string $message) use ($geofenceMonitor) {
            $data = json_decode($message, true);
            if (!$data) return;

            $imei = $this->extractImei($topic);
            $event = new DevicePositionUpdated($imei, $data);
            broadcast($event);

            $payload = $event->broadcastWith();
            $lat = $payload['lat'];
            $lng = $payload['lng'];
            $this->line("[position] {$imei} → " . ($lat ?? '?') . ', ' . ($lng ?? '?'));

            if ($lat !== null && $lng !== null) {
                foreach ($geofenceMonitor->checkPosition($imei, (float) $lat, (float) $lng) as $geofenceEvent) {
                    $this->line("[geofence] {$imei} → {$geofenceEvent->type} \"{$geofenceEvent->geofence->name}\"");
                }
            }
        });

        // All device alerts: {userId}/alert/{imei}
        $mqtt->subscribe("{$userId}/alert/#", function (string $topic, string $message) {
            $data = json_decode($message, true);
            if (!$data) return;

            $imei = $this->extractImei($topic);
            $event = new DeviceAlertReceived($imei, $data);
            broadcast($event);

            $type = $event->broadcastWith()['type'] ?? 'unknown';
            $this->line("[alert]    {$imei} → {$type}");
        });

        // OBD/sensor readings (fuel level, etc). TurboHive's MQTT panel offers a "sensor" message
        // type, but "obd" is also a plausible topic (mirrors the REST API's OBD tag) — subscribe
        // to both since an unused subscription is harmless and we don't have documentation
        // confirming which one the real device actually publishes to.
        $sensorHandler = function (string $topic, string $message) {
            $data = json_decode($message, true);
            if (!$data) return;

            $imei = $this->extractImei($topic);
            $event = new DeviceSensorUpdated($imei, $data);
            broadcast($event);

            $fuel = $event->broadcastWith()['fuelLevel'];
            $this->line("[sensor]   {$imei} ({$topic}) → fuel=" . ($fuel ?? '?'));
        };
        $mqtt->subscribe("{$userId}/sensor/#", $sensorHandler);
        $mqtt->subscribe("{$userId}/obd/#", $sensorHandler);

        // Card reader (RFID/iButton) check-ins. TurboHive has no REST history endpoint for this —
        // only this live "Unified Peripherals" push (messageType "dlt") — so this is the only
        // place check-ins are ever captured; see the driver_checkins migration's docblock.
        $mqtt->subscribe("{$userId}/peri/#", function (string $topic, string $message) {
            $data = json_decode($message, true);
            if (!$data) return;

            $msgType = $data['messageType'] ?? $data['msgType'] ?? $data['type'] ?? null;
            if ($msgType !== 'dlt') return;

            $imei = $this->extractImei($topic);
            $cardId = $data['driver.license'] ?? $data['driverLicense'] ?? $data['license']
                ?? $data['driver.cardId'] ?? $data['cardId'] ?? null;
            if (!$cardId) return;

            $deviceTimeMs = $data['device.time'] ?? $data['deviceTime'] ?? $data['time'] ?? null;

            $driver = Driver::where('rfid_card_no', $cardId)
                ->orWhere('ibutton_no', $cardId)
                ->first();

            $checkin = DriverCheckin::create([
                'imei'           => $imei,
                'driver_card_id' => $cardId,
                'driver_id'      => $driver?->id,
                'checkin_time'   => $deviceTimeMs ? Carbon::createFromTimestampMs($deviceTimeMs) : now(),
                'server_time'    => now(),
                'latitude'       => $data['gnss.lat'] ?? $data['latitude'] ?? $data['lat'] ?? null,
                'longitude'      => $data['gnss.lng'] ?? $data['longitude'] ?? $data['lng'] ?? null,
            ]);

            broadcast(new DriverCheckedIn($checkin));

            $this->line("[checkin]  {$imei} → card {$cardId}" . ($driver ? " ({$driver->name})" : ' (unrecognized card)'));
        });

        $mqtt->loop(true);
    }

    private function extractImei(string $topic): string
    {
        $parts = explode('/', $topic);
        return end($parts);
    }
}
