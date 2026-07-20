<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VehicleSetting extends Model
{
    protected $fillable = [
        'imei',
        'relay_disconnect_enabled',
        'relay_channel',
        'fuel_rate_l_per_100km',
        'fuel_tank_capacity_liters',
        'vehicle_type',
    ];

    protected function casts(): array
    {
        return [
            'relay_disconnect_enabled' => 'boolean',
        ];
    }
}
