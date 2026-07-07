<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DevicePositionUpdated implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly string $imei,
        public readonly array  $position,
    ) {}

    public function broadcastOn(): Channel
    {
        // Single shared channel — frontend subscribes once for all devices
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'position.updated';
    }

    /**
     * TurboHive's raw MQTT payload shape isn't formally documented, but capturing a real alert
     * message on {userId}/alert/{imei} confirmed it uses the same dotted-key convention as the
     * REST API ("gnss.lat", "gnss.lng", "device.time", etc — see DeviceAlertReceived's docblock).
     * The location topic almost certainly follows the same convention, so those dotted keys are
     * checked first, with flat/nested fallbacks kept for safety. This is the single source of
     * truth for extracting lat/lng from a raw position payload — MqttWorker calls
     * broadcastWith() rather than re-deriving these fields itself, so the two can't drift out of
     * sync the way they previously did (which silently broke map markers once MQTT started
     * actually delivering dotted-key position payloads instead of the flat shape this used to
     * assume).
     */
    public function broadcastWith(): array
    {
        $p = $this->position;
        $gnss   = is_array($p['gnss'] ?? null) ? $p['gnss'] : [];
        $coords = is_array($p['coords'] ?? null) ? $p['coords'] : [];

        return [
            'imei' => $this->imei,
            'lat' => $p['gnss.lat'] ?? $p['gnss.latitude'] ?? $p['latitude'] ?? $p['lat'] ?? $p['lat_gps']
                ?? $gnss['latitude'] ?? $gnss['lat'] ?? $coords['latitude'] ?? $coords['lat'] ?? null,
            'lng' => $p['gnss.lng'] ?? $p['gnss.lon'] ?? $p['gnss.longitude'] ?? $p['longitude'] ?? $p['lng'] ?? $p['lon'] ?? $p['long']
                ?? $gnss['longitude'] ?? $gnss['lng'] ?? $gnss['lon'] ?? $coords['longitude'] ?? $coords['lng'] ?? null,
            'speed' => $p['gnss.speed'] ?? $p['speed'] ?? $p['spd'] ?? $gnss['speed'] ?? null,
            'heading' => $p['gnss.course'] ?? $p['gnss.heading'] ?? $p['heading'] ?? $p['course'] ?? $p['direction']
                ?? $gnss['course'] ?? $gnss['heading'] ?? null,
            'acc' => $p['device.acc'] ?? $p['io.acc'] ?? $p['acc'] ?? $p['ignition'] ?? null,
            'altitude' => $p['gnss.altitude'] ?? $p['altitude'] ?? $p['alt'] ?? $gnss['altitude'] ?? null,
            'timestamp' => $p['device.time'] ?? $p['deviceTime'] ?? $p['gpsTime'] ?? $p['time'] ?? now()->toISOString(),
        ];
    }
}
