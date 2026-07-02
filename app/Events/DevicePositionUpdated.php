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

    public function broadcastWith(): array
    {
        $p = $this->position;
        return [
            'imei'      => $this->imei,
            'lat'       => $p['lat']        ?? $p['latitude']   ?? null,
            'lng'       => $p['lng']        ?? $p['longitude']  ?? null,
            'speed'     => $p['speed']      ?? $p['spd']        ?? null,
            'heading'   => $p['heading']    ?? $p['course']     ?? $p['direction'] ?? null,
            'acc'       => $p['acc']        ?? $p['ignition']   ?? null,
            'altitude'  => $p['altitude']   ?? $p['alt']        ?? null,
            'timestamp' => $p['deviceTime'] ?? $p['gpsTime']    ?? now()->toISOString(),
        ];
    }
}
