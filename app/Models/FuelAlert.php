<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Persisted history of TurboHive fuel-sensor alerts (codes 1222-1225) — see the
 *  create_fuel_alerts_table migration docblock and MqttWorker::recordFuelAlert. */
class FuelAlert extends Model
{
    protected $fillable = [
        'imei',
        'code',
        'type',
        'trigger_type',
        'severity',
        'description',
        'latitude',
        'longitude',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
        ];
    }
}
