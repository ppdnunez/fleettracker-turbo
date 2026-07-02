<?php

namespace App\Events;

use App\Models\GeofenceEvent;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GeofenceEventTriggered implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly GeofenceEvent $event,
        public readonly string $geofenceName,
    ) {}

    public function broadcastOn(): Channel
    {
        // Same shared channel as DevicePositionUpdated — frontend subscribes once for all devices
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'geofence.event';
    }

    public function broadcastWith(): array
    {
        return [
            'imei'         => $this->event->imei,
            'geofenceId'   => $this->event->geofence_id,
            'geofenceName' => $this->geofenceName,
            'type'         => $this->event->type,
            'latitude'     => $this->event->latitude,
            'longitude'    => $this->event->longitude,
            'triggeredAt'  => $this->event->triggered_at->valueOf(),
        ];
    }
}
