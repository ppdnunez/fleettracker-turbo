<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FaceUploadReceipt extends Model
{
    protected $fillable = [
        'imei',
        'driver_id',
        'instruction_id',
        'file_name',
        'stored_path',
        'signature_valid',
        'response_code',
        'response_message',
        'ip',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'signature_valid' => 'boolean',
            'response_code'   => 'integer',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
