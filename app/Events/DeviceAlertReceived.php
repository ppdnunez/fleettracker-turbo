<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DeviceAlertReceived implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly string $imei,
        public readonly array  $alert,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'alert.received';
    }

    /**
     * Field names mirror TurboHiveService::getAlerts's flattening of the REST /v3/alerts/page
     * response ("alert.type" → "type", "gnss.lat" → "latitude", etc.), so the raw MQTT payload's
     * fields are tried both dotted (matching that REST convention) and flat as a fallback, since
     * TurboHive doesn't document the MQTT alert payload shape. Keeping the same field names as
     * getAlerts() lets the frontend classify/display live and historical alerts identically (see
     * classifyDriverBehavior in ReportPage.jsx).
     */
    public function broadcastWith(): array
    {
        $a = $this->alert;
        $extra = json_decode($a['alert.extraInfo'] ?? $a['extraInfo'] ?? '', true) ?: [];

        return [
            'imei'        => $this->imei,
            'type'        => $a['alert.type'] ?? $a['type'] ?? $a['alertType'] ?? null,
            'name'        => $a['alert.name'] ?? $a['name'] ?? null,
            'description' => $a['alert.description'] ?? $a['description'] ?? null,
            'latitude'    => $a['gnss.lat'] ?? $a['latitude'] ?? $a['lat'] ?? null,
            'longitude'   => $a['gnss.lng'] ?? $a['longitude'] ?? $a['lng'] ?? null,
            'speed'       => $extra['gpsSpeed'] ?? $a['speed'] ?? null,
            'timestamp'   => $a['alert.time'] ?? $a['time'] ?? $a['alertTime'] ?? now()->valueOf(),
            'raw'         => $a,
        ];
    }
}
