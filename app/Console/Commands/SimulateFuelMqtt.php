<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PhpMqtt\Client\ConnectionSettings;
use PhpMqtt\Client\MqttClient;

/**
 * Publishes fake fuel-drop readings to TurboHive's MQTT broker on the {userId}/obd/{imei} topic,
 * so the DeviceSensorUpdated → mqtt:worker → Reverb → Current Fuel Value pipeline can be
 * exercised end-to-end without waiting for the real device to report. Dev/debug tool only.
 */
class SimulateFuelMqtt extends Command
{
    protected $signature   = 'simulate:fuel {imei? : Device IMEI to simulate} {--from=80} {--to=60} {--step=5} {--delay=3}';
    protected $description = 'Simulate a TurboHive MQTT fuel-level message stream (topic: {userId}/obd/{imei})';

    public function handle(): void
    {
        $cfg    = config('services.turbohive_mqtt');
        $userId = $cfg['user_id'];
        $imei   = $this->argument('imei') ?? '863800080020265';

        $mqtt = new MqttClient($cfg['host'], (int) $cfg['port'], 'simulator-' . uniqid());

        $settings = (new ConnectionSettings)
            ->setUsername($cfg['username'])
            ->setPassword($cfg['password']);

        $mqtt->connect($settings, true);

        $topic = "{$userId}/obd/{$imei}";
        $this->info("Publishing to {$topic} …");

        $from  = (int) $this->option('from');
        $to    = (int) $this->option('to');
        $step  = (int) $this->option('step');
        $delay = (int) $this->option('delay');
        $direction = $from <= $to ? $step : -$step;

        for ($fuel = $from; $direction > 0 ? $fuel <= $to : $fuel >= $to; $fuel += $direction) {
            $payload = json_encode([
                'fuel.level'      => $fuel,
                'engine.speed'    => rand(800, 2000),
                'vehicle.speed'   => rand(0, 80),
                'coolant.temp'    => rand(85, 95),
                'battery.voltage' => 12.4,
                'deviceTime'      => now()->valueOf(),
            ]);

            $mqtt->publish($topic, $payload);
            $this->info("Published fuel level: {$fuel}%");

            if ($fuel !== $to) {
                sleep($delay);
            }
        }

        $mqtt->disconnect();
        $this->info('Simulation complete.');
    }
}
