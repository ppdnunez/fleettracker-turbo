<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VehicleSetting extends Model
{
    protected $fillable = [
        'imei',
        'relay_disconnect_enabled',
        'relay_disconnect_on_face_fail',
        'relay_channel',
        'fuel_rate_l_per_100km',
        'fuel_tank_capacity_liters',
        'vehicle_type',
        'fuel_type',
        'safety_sticker_expiry',
        'sticker_notify_days_before',
        'sticker_notified_at',
        'insurance_expiry',
        'insurance_notify_days_before',
        'insurance_notified_at',
        'sim_number',
        'sim_data_expiry',
        'sim_notify_days_before',
        'sim_notified_at',
    ];

    protected function casts(): array
    {
        return [
            'relay_disconnect_enabled' => 'boolean',
            'relay_disconnect_on_face_fail' => 'boolean',
            'safety_sticker_expiry'    => 'date',
            'sticker_notified_at'      => 'date',
            'insurance_expiry'         => 'date',
            'insurance_notified_at'    => 'date',
            'sim_data_expiry'          => 'date',
            'sim_notified_at'          => 'date',
        ];
    }
}
