<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;
use App\Events\DevicePositionUpdated;
use App\Events\DeviceAlertReceived;
use App\Events\DeviceSensorUpdated;
use App\Services\GeofenceMonitorService;

class MqttWorker extends Command
{
    protected $signature   = 'mqtt:worker';
    protected $description = 'Listen to TurboHive MQTT and broadcast device positions to frontend';

    public function handle(GeofenceMonitorService $geofenceMonitor): void
    {
        $cfg    = config('services.turbohive_mqtt');
        $userId = $cfg['user_id'];

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
            broadcast(new DevicePositionUpdated($imei, $data));

            [$lat, $lng] = $this->extractLatLng($data);
            $this->line("[position] {$imei} → " . ($lat ?? '?') . ', ' . ($lng ?? '?'));

            if ($lat !== null && $lng !== null) {
                foreach ($geofenceMonitor->checkPosition($imei, (float) $lat, (float) $lng) as $event) {
                    $this->line("[geofence] {$imei} → {$event->type} \"{$event->geofence->name}\"");
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

        $mqtt->loop(true);
    }

    private function extractImei(string $topic): string
    {
        $parts = explode('/', $topic);
        return end($parts);
    }

    /**
     * TurboHive's raw MQTT payload shape isn't documented — mirrors the same fallback chain
     * resources/js/turbohive-mqtt.js already uses client-side (nested gnss.lat/lng), plus the
     * flat dotted-key convention ("gnss.lat") TurboHive's REST API uses for normalized location
     * data (see TurboHiveService::getPositioningBattery/getTrack), in case MQTT reuses it too.
     */
    private function extractLatLng(array $data): array
    {
        $gnss = is_array($data['gnss'] ?? null) ? $data['gnss'] : [];
        $coords = is_array($data['coords'] ?? null) ? $data['coords'] : [];

        $lat = $data['latitude']
            ?? $data['lat']
            ?? $data['lat_gps']
            ?? $data['gnss.lat']
            ?? $data['gnss.latitude']
            ?? $gnss['latitude']
            ?? $gnss['lat']
            ?? $coords['latitude']
            ?? $coords['lat']
            ?? null;

        $lng = $data['longitude']
            ?? $data['lng']
            ?? $data['lon']
            ?? $data['long']
            ?? $data['gnss.lng']
            ?? $data['gnss.lon']
            ?? $data['gnss.longitude']
            ?? $gnss['longitude']
            ?? $gnss['lng']
            ?? $gnss['lon']
            ?? $coords['longitude']
            ?? $coords['lng']
            ?? null;

        return [$lat, $lng];
    }
}
