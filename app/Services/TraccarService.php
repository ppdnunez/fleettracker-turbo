<?php

namespace App\Services;

use App\Contracts\GpsProviderInterface;
use Illuminate\Support\Facades\Http;

class TraccarService implements GpsProviderInterface
{
    protected string $url;

    public function __construct()
    {
        $this->url = config('services.traccar.url');
    }

    protected function client()
    {
        return Http::withBasicAuth(
            config('services.traccar.email'),
            config('services.traccar.password')
        )->baseUrl($this->url);
    }

    public function getDevices(): array
    {
        return $this->client()->get('/api/devices')->json();
    }

    public function getAlerts(string $imei, array $params = []): array
    {
        return $this->client()->get('/api/events', $params)->json();
    }

    public function getTrack(string $imei, string $from, string $to): array
    {
        return $this->client()->get('/api/positions', [
            'deviceId' => $imei,
            'from'     => $from,
            'to'       => $to,
        ])->json();
    }

    public function sendCommand(string $imei, string $command): array
    {
        return $this->client()->post('/api/commands/send', [
            'deviceId' => $imei,
            'type'     => $command,
        ])->json();
    }
}
