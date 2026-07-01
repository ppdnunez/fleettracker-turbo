<?php

namespace App\Contracts;

interface GpsProviderInterface
{
    public function getDevices(): array;
    public function getAlerts(string $imei, array $params = []): array;
    public function getTrack(string $imei, string $from, string $to): array;
    public function sendCommand(string $imei, string $command): array;
}
