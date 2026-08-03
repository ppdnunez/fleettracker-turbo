<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverFace extends Model
{
    protected $fillable = [
        'driver_id',
        'imei',
        'cmd_no',
        'status',
        'photo_path',
        'error',
        'requested_at',
        'enrolled_at',
    ];

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'enrolled_at'  => 'datetime',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
