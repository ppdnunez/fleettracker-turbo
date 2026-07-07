<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverCheckin extends Model
{
    protected $fillable = [
        'imei',
        'driver_card_id',
        'driver_id',
        'checkin_time',
        'server_time',
        'latitude',
        'longitude',
    ];

    protected function casts(): array
    {
        return [
            'checkin_time' => 'datetime',
            'server_time'  => 'datetime',
            'latitude'     => 'float',
            'longitude'    => 'float',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
