<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A subscriber to one or more of this app's alert emails — the central list behind
 * AlertRecipientController, replacing the old single-address .env configs and the
 * "email every registered User" fallback (see the create_alert_recipients_table migration's
 * docblock for the carry-over from both).
 */
class AlertRecipient extends Model
{
    /** value => label shown in the recipients UI; also the only valid values for `categories`. */
    public const CATEGORIES = [
        'geofence'            => 'Geofence Enter/Exit',
        'driver_checkin'      => 'Face Recognition / Driver Check-in',
        'driver_expiry'       => 'Driver License & Safety Sticker Expiry',
        'vehicle_maintenance' => 'Vehicle Maintenance Due',
    ];

    protected $fillable = [
        'email',
        'name',
        'categories',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'categories' => 'array',
            'active'     => 'boolean',
        ];
    }

    /** Active recipients' addresses for one category — what every alert-sending call site uses. */
    public static function emailsFor(string $category): array
    {
        return static::where('active', true)
            ->get(['email', 'categories'])
            ->filter(fn (self $r) => in_array($category, $r->categories ?? [], true))
            ->pluck('email')
            ->values()
            ->all();
    }
}
