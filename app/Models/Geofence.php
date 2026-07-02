<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Geofence extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'area'];

    /**
     * Devices (by TurboHive IMEI) this geofence is linked to. A geofence is only ever checked
     * against devices linked here — mirrors Traccar's separate /api/permissions step.
     */
    public function links(): HasMany
    {
        return $this->hasMany(GeofenceDevice::class);
    }
}
