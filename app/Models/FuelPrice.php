<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FuelPrice extends Model
{
    protected $fillable = [
        'fuel_type',
        'price_per_liter',
        'effective_date',
    ];

    protected function casts(): array
    {
        return [
            'price_per_liter' => 'decimal:2',
            'effective_date'  => 'date',
        ];
    }
}
