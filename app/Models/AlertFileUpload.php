<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AlertFileUpload extends Model
{
    protected $fillable = [
        'imei',
        'alert_type',
        'alert_code',
        'alert_time',
        'file_names',
        'longitude',
        'latitude',
        'status',
        'uploaded_file_list',
        'uploaded_file_path',
        'uploaded_file_size',
        'upload_result',
        'cmd_no',
        'requested_at',
        'uploaded_at',
    ];

    protected function casts(): array
    {
        return [
            'file_names'         => 'array',
            'uploaded_file_list' => 'array',
            'alert_time'         => 'datetime',
            'requested_at'       => 'datetime',
            'uploaded_at'        => 'datetime',
        ];
    }
}
