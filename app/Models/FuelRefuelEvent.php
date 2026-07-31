<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FuelRefuelEvent extends Model
{
    protected $fillable = [
        'imei',
        'from_percent',
        'to_percent',
        'change_percent',
        'detected_at',
    ];

    protected function casts(): array
    {
        return [
            'from_percent'   => 'float',
            'to_percent'     => 'float',
            'change_percent' => 'float',
            'detected_at'    => 'datetime',
        ];
    }
}
