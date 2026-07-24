<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FaceRecognitionEvent extends Model
{
    protected $fillable = [
        'imei',
        'driver_id',
        'result',
        'file_names',
        'latitude',
        'longitude',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'file_names'  => 'array',
            'latitude'    => 'float',
            'longitude'   => 'float',
            'occurred_at' => 'datetime',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
