<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FuelAbnormalLossEvent extends Model
{
    protected $fillable = [
        'imei',
        'from_percent',
        'to_percent',
        'change_percent',
        'from_odometer_km',
        'to_odometer_km',
        'distance_km',
        'detected_at',
    ];

    protected function casts(): array
    {
        return [
            'from_percent'     => 'float',
            'to_percent'       => 'float',
            'change_percent'   => 'float',
            'from_odometer_km' => 'float',
            'to_odometer_km'   => 'float',
            'distance_km'      => 'float',
            'detected_at'      => 'datetime',
        ];
    }
}
