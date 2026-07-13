<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VehicleMaintenance extends Model
{
    protected $fillable = [
        'imei',
        'maintenance_type',
        'description',
        'status',
        'due_date',
        'due_odometer_km',
        'notify_days_before',
        'notify_km_before',
        'completed_date',
        'completed_odometer_km',
        'cost',
        'vendor',
        'notes',
        'notified_due_date',
        'notified_due_odometer_km',
    ];

    protected function casts(): array
    {
        return [
            'due_date'                  => 'date',
            'completed_date'            => 'date',
            'notified_due_date'         => 'date',
            'due_odometer_km'           => 'decimal:2',
            'completed_odometer_km'     => 'decimal:2',
            'notified_due_odometer_km'  => 'decimal:2',
            'cost'                      => 'decimal:2',
        ];
    }
}
