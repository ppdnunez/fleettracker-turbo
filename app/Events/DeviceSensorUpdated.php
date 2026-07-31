<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TurboHive's MQTT "sensor"/"obd" topics ({userId}/sensor/{imei}, {userId}/obd/{imei}) — carry
 * OBD/sensor readings (fuel level, temperature/humidity probes, etc.) separately from the
 * location/gnss topic. Field names aren't documented; extraction uses a best-effort fallback
 * chain covering flat ("fuelLevel"), dotted ("fuel.level", matching TurboHive's REST dotted-key
 * convention), and nested variants.
 */
class DeviceSensorUpdated implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly string $imei,
        public readonly array  $sensor,
    ) {}

    public function broadcastOn(): Channel
    {
        // Same shared channel as DevicePositionUpdated — frontend subscribes once for all devices
        return new Channel('fleet');
    }

    public function broadcastAs(): string
    {
        return 'sensor.updated';
    }

    public function broadcastWith(): array
    {
        $s = $this->sensor;
        $obd = is_array($s['obd'] ?? null) ? $s['obd'] : [];
        $sensorObj = is_array($s['sensor'] ?? null) ? $s['sensor'] : [];

        return [
            'imei' => $this->imei,
            'fuelLevel'   => $s['fuelLevel'] ?? $s['fuel_level'] ?? $s['fuel'] ?? $s['fuel.level']
                ?? $s['obd.fuelLevel'] ?? $obd['fuelLevel'] ?? null,
            // Same best-effort guessing as fuelLevel above — TurboHive documents neither field name
            // for this live topic (confirmed field names, where they exist, are for the separate
            // GET /v3/obd REST endpoint only). Used by MqttWorker::detectAbnormalLoss/detectIdleFuel;
            // if the live payload doesn't actually carry these under any of these names, those
            // detectors simply never fire — same shape of caveat as obdOdometer's on the frontend.
            'odometer'    => $s['odometer'] ?? $s['mileage'] ?? $s['totalMileage'] ?? $s['odo']
                ?? $s['obd.odometer'] ?? $obd['odometer'] ?? null,
            'totalFuelConsumption' => $s['totalFuelConsumption'] ?? $s['total_fuel_consumption']
                ?? $s['obd.totalFuelConsumption'] ?? $obd['totalFuelConsumption'] ?? null,
            'voltage'     => $s['voltage'] ?? $s['batteryVoltage'] ?? $s['battery.voltage'] ?? $s['obd.batteryVoltage']
                ?? $obd['batteryVoltage'] ?? null,
            'engineSpeed' => $s['engineSpeed'] ?? $s['engine.speed'] ?? $obd['engineSpeed'] ?? null,
            'speed'       => $s['vehicleSpeed'] ?? $s['vehicle.speed'] ?? $obd['vehicleSpeed'] ?? null,
            'coolantTemp' => $s['coolantTemp'] ?? $s['coolant.temp'] ?? $obd['coolantTemp'] ?? null,
            'temperature' => $s['temperature'] ?? $s['temp'] ?? $s['temp1'] ?? $s['sensor.temperature'] ?? $s['sensor.temp']
                ?? $sensorObj['temperature'] ?? $sensorObj['temp'] ?? null,
            'humidity'    => $s['humidity'] ?? $s['hum'] ?? $s['sensor.humidity'] ?? $sensorObj['humidity'] ?? $sensorObj['hum'] ?? null,
            'timestamp'   => $s['deviceTime'] ?? $s['gateTime'] ?? $s['time'] ?? now()->valueOf(),
            'raw'         => $s,
        ];
    }
}
