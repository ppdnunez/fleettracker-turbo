<?php

namespace App\Events;

use App\Models\DriverCheckin;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DriverCheckedIn implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly DriverCheckin $checkin,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'driver.checked-in';
    }

    public function broadcastWith(): array
    {
        $c = $this->checkin;
        $c->loadMissing('driver');

        return [
            'id'           => $c->id,
            'imei'         => $c->imei,
            'driverCardId' => $c->driver_card_id,
            'driverId'     => $c->driver_id,
            'driverName'   => $c->driver?->name,
            'driverBadge'  => $c->driver?->badge_no,
            'checkinTime'  => $c->checkin_time?->valueOf(),
            'latitude'     => $c->latitude,
            'longitude'    => $c->longitude,
        ];
    }
}
