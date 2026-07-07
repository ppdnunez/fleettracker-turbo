<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Driver extends Model
{
    protected $fillable = [
        'badge_no',
        'name',
        'phone',
        'license_no',
        'rfid_card_no',
        'ibutton_no',
        'register_place',
        'register_date',
        'license_expiry',
        'safety_sticker_expiry',
        'notify_days_before',
        'status',
        'traccar_driver_id',
        'traccar_unique_id',
        'license_notified_at',
        'sticker_notified_at',
    ];

    /** Vehicles (by TurboHive IMEI) this driver is assigned to. See [[driver_device]]. */
    public function links(): HasMany
    {
        return $this->hasMany(DriverDevice::class);
    }

    protected function casts(): array
    {
        return [
            'register_date'         => 'date',
            'license_expiry'        => 'date',
            'safety_sticker_expiry' => 'date',
            'license_notified_at'   => 'date',
            'sticker_notified_at'   => 'date',
        ];
    }
}
