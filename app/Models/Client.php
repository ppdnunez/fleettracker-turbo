<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    protected $fillable = [
        'name',
        'traccar_group_id',
        'status',
    ];

    public function users()
    {
        return $this->hasMany(User::class);
    }
}
