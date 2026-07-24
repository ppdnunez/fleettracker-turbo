<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeviceCommand extends Model
{
    protected $fillable = [
        'batch_id',
        'imei',
        'content',
        'message_format',
        'is_manual',
        'mode',
        'status',
        'response',
        'sent_by',
    ];

    protected function casts(): array
    {
        return [
            'is_manual' => 'boolean',
            'response'  => 'array',
        ];
    }

    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}
