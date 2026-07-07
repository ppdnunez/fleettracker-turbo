<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DeviceAlertReceived implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    /**
     * Partial alert.code → human name map, built only from confirmed observations (TurboHive
     * doesn't publish this mapping): 1401 was captured live via TurboHive's own MQTT test console
     * as an Emergency SOS trigger; 1402/1501/1002 were seen in real GET /v3/alerts/page responses
     * paired with their alert.name. The raw live MQTT payload never includes alert.name/description
     * at all (unlike the REST response), so this is the only way to label live alerts by anything
     * other than their raw numeric code. Unmapped codes fall back to showing the code itself.
     */
    private const KNOWN_CODE_NAMES = [
        '1401' => 'Emergency SOS',
        '1402' => 'Camera Fault',
        '1501' => 'Unexpected Vibration',
        '1002' => 'External Power Off',
    ];

    public function __construct(
        public readonly string $imei,
        public readonly array  $alert,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'alert.received';
    }

    /**
     * Real raw MQTT payload (captured via TurboHive's own MQTT test console on
     * {userId}/alert/{imei}), e.g.:
     *   {"alert.type": 1, "alert.code": "1401", "device.imei": "...", "gnss.lng": 147.18224,
     *    "gnss.lat": -9.443918, "device.time": 1783037773000, "alert.msgClass": 0}
     * Notably: alert.type is numeric (not TurboHiveService::getAlerts's REST-only "256-6" style
     * string), there's no alert.name/alert.description at all, and the timestamp field is
     * device.time rather than alert.time. Field names are still tried both dotted and flat as a
     * fallback, since TurboHive doesn't formally document this shape and it could vary by alert.
     */
    public function broadcastWith(): array
    {
        $a = $this->alert;
        $extra = json_decode($a['alert.extraInfo'] ?? $a['extraInfo'] ?? '', true) ?: [];
        $code  = (string) ($a['alert.code'] ?? $a['code'] ?? '');

        return [
            'imei'        => $this->imei,
            'type'        => $a['alert.type'] ?? $a['type'] ?? $a['alertType'] ?? null,
            'code'        => $code !== '' ? $code : null,
            'name'        => $a['alert.name'] ?? $a['name'] ?? self::KNOWN_CODE_NAMES[$code] ?? null,
            'description' => $a['alert.description'] ?? $a['description'] ?? null,
            'latitude'    => $a['gnss.lat'] ?? $a['latitude'] ?? $a['lat'] ?? null,
            'longitude'   => $a['gnss.lng'] ?? $a['longitude'] ?? $a['lng'] ?? null,
            'speed'       => $extra['gpsSpeed'] ?? $a['speed'] ?? null,
            'msgClass'    => $a['alert.msgClass'] ?? $a['msgClass'] ?? null,
            'timestamp'   => $a['device.time'] ?? $a['alert.time'] ?? $a['time'] ?? $a['alertTime'] ?? now()->valueOf(),
            'raw'         => $a,
        ];
    }
}
