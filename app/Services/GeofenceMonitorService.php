<?php

namespace App\Services;

use App\Events\GeofenceEventTriggered;
use App\Mail\GeofenceAlertMail;
use App\Models\AlertRecipient;
use App\Models\GeofenceDevice;
use App\Models\GeofenceEvent;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Detects geofence enter/exit transitions from live positions. TurboHive has no geofence concept
 * itself (see GeofenceController), so this mirrors Traccar's server-side approach: for each
 * position, test it against every geofence linked to that device (GeofenceDevice), compare with
 * the link's last known is_inside state, and persist + broadcast a GeofenceEvent on transition.
 * Called from MqttWorker on every incoming position.
 */
class GeofenceMonitorService
{
    private const EARTH_RADIUS_M = 6371000;

    /** Resolved device names by IMEI, kept for the lifetime of this instance (mqtt:worker runs as
     *  one long-lived process, so this avoids re-querying TurboHive on every geofence transition
     *  for a device it's already looked up). */
    private array $deviceNameCache = [];

    public function __construct(private TurboHiveService $turboHive)
    {
    }

    /**
     * @return GeofenceEvent[] events triggered by this position (usually empty)
     */
    public function checkPosition(string $imei, float $lat, float $lng): array
    {
        $links = GeofenceDevice::with('geofence')->where('imei', $imei)->get();
        $triggered = [];

        foreach ($links as $link) {
            $geofence = $link->geofence;
            if (!$geofence) {
                continue;
            }

            $isInside = $this->pointInArea($lat, $lng, $geofence->area);
            if ($isInside === $link->is_inside) {
                continue;
            }

            $link->update(['is_inside' => $isInside]);

            $event = GeofenceEvent::create([
                'geofence_id'  => $geofence->id,
                'imei'         => $imei,
                'type'         => $isInside ? 'enter' : 'exit',
                'latitude'     => $lat,
                'longitude'    => $lng,
                'triggered_at' => now(),
            ]);

            broadcast(new GeofenceEventTriggered($event, $geofence->name));
            $this->sendAlertEmail($event, $geofence->name);
            $triggered[] = $event;
        }

        return $triggered;
    }

    /**
     * Sent synchronously (GeofenceAlertMail has no ShouldQueue — see its docblock). A delivery
     * failure (bad SMTP creds, network blip) is logged rather than thrown, since it shouldn't stop
     * geofence detection/broadcasting for the position that's currently being processed.
     */
    private function sendAlertEmail(GeofenceEvent $event, string $geofenceName): void
    {
        $recipients = AlertRecipient::emailsFor('geofence');
        if (empty($recipients)) {
            return;
        }

        try {
            foreach ($recipients as $to) {
                Mail::to($to)->send(new GeofenceAlertMail($event, $geofenceName, $this->resolveDeviceName($event->imei)));
            }
        } catch (\Throwable $e) {
            Log::warning('Geofence alert email failed to send', [
                'to' => $recipients,
                'geofence_event_id' => $event->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /** Looks up the device's friendly name via TurboHive's device list (filtered by IMEI keyword)
     *  so the email reads e.g. "nextgengps (863800080020265)" instead of just the bare IMEI. Falls
     *  back to null (email shows IMEI only) if the lookup fails or the device isn't found. */
    private function resolveDeviceName(string $imei): ?string
    {
        if (array_key_exists($imei, $this->deviceNameCache)) {
            return $this->deviceNameCache[$imei];
        }

        $name = null;
        try {
            $list = $this->turboHive->getDevices(['keyword' => $imei, 'size' => 5])['data'] ?? [];
            $match = collect($list)->firstWhere('imei', $imei);
            $name = $match['deviceName'] ?? null;
        } catch (\Throwable $e) {
            Log::warning('Failed to resolve device name for geofence alert email', [
                'imei' => $imei,
                'error' => $e->getMessage(),
            ]);
        }

        return $this->deviceNameCache[$imei] = $name;
    }

    /** Same WKT subset GeofencePage.jsx draws: CIRCLE (lat lng, radiusMeters) / POLYGON ((lat lng, ...)). */
    private function pointInArea(float $lat, float $lng, string $area): bool
    {
        if (preg_match('/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i', $area, $m)) {
            return $this->haversineMeters($lat, $lng, (float) $m[1], (float) $m[2]) <= (float) $m[3];
        }

        if (preg_match('/^POLYGON\s*\(\(([^)]+)\)\)$/i', $area, $m)) {
            $points = array_map(function (string $pair) {
                [$plat, $plng] = preg_split('/\s+/', trim($pair));
                return [(float) $plat, (float) $plng];
            }, explode(',', $m[1]));

            return $this->pointInPolygon($lat, $lng, $points);
        }

        return false;
    }

    private function haversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $toRad = fn (float $d) => $d * M_PI / 180;
        $dLat = $toRad($lat2 - $lat1);
        $dLng = $toRad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos($toRad($lat1)) * cos($toRad($lat2)) * sin($dLng / 2) ** 2;

        return self::EARTH_RADIUS_M * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /** Standard ray-casting point-in-polygon test; good enough at geofence scale. */
    private function pointInPolygon(float $lat, float $lng, array $points): bool
    {
        $inside = false;
        $count = count($points);
        for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
            [$yi, $xi] = $points[$i];
            [$yj, $xj] = $points[$j];
            $intersect = ($yi > $lat) !== ($yj > $lat)
                && $lng < ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi;
            if ($intersect) {
                $inside = !$inside;
            }
        }

        return $inside;
    }
}
