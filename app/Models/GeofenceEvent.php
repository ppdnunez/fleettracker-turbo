<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeofenceEvent extends Model
{
    protected $fillable = ['geofence_id', 'imei', 'type', 'latitude', 'longitude', 'triggered_at'];

    protected $casts = [
        'latitude'     => 'float',
        'longitude'    => 'float',
        'triggered_at' => 'datetime',
    ];

    public function geofence(): BelongsTo
    {
        return $this->belongsTo(Geofence::class);
    }
}
