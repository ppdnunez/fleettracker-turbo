<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Local-only ownership record mapping a Traccar calendar id to the SaaS client that created it -
// see the migration comment on traccar_calendar_owners for why this can't just live in Traccar.
class TraccarCalendarOwner extends Model
{
    protected $fillable = [
        'traccar_calendar_id',
        'client_id',
    ];
}
