<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FuelIdleEvent extends Model
{
    protected $fillable = [
        'imei',
        'start_time',
        'end_time',
        'fuel_used',
    ];

    protected function casts(): array
    {
        return [
            'start_time' => 'datetime',
            'end_time'   => 'datetime',
            'fuel_used'  => 'float',
        ];
    }
}
