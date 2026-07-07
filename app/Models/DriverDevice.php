<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverDevice extends Model
{
    protected $table = 'driver_device';

    protected $fillable = ['driver_id', 'imei'];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
