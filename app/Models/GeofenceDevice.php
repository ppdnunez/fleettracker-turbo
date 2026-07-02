<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeofenceDevice extends Model
{
    protected $table = 'geofence_device';

    protected $fillable = ['geofence_id', 'imei', 'is_inside'];

    protected $casts = ['is_inside' => 'boolean'];

    public function geofence(): BelongsTo
    {
        return $this->belongsTo(Geofence::class);
    }
}
