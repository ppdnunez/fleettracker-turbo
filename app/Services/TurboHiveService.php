<?php

namespace App\Services;

use App\Contracts\GpsProviderInterface;
use Illuminate\Support\Facades\Http;

class TurboHiveService implements GpsProviderInterface
{
    protected string $baseUrl;
    protected string $token;

    public function __construct()
    {
        $this->baseUrl = config('services.turbohive.base_url');
        $this->token = config('services.turbohive.token');
    }

    protected function client()
    {
        return Http::withHeaders([
            'Authorization' => "Bearer {$this->token}",
            'Content-Type' => 'application/json',
        ])->baseUrl($this->baseUrl);
    }

    public function getDevices(): array
    {
        return $this->client()->get('/v3/devices')->json();
    }

    public function getAlerts(string $imei, array $params = []): array
    {
        return $this->client()->get('/v3/alerts', array_merge(['imei' => $imei], $params))->json();
    }

    public function getTrack(string $imei, string $from, string $to): array
    {
        return $this->client()->get('/v3/track', [
            'imei' => $imei,
            'from' => $from,
            'to' => $to,
        ])->json();
    }

    public function getDeviceLocation(string $imei): array
    {
        return $this->client()->get('/v3/tag/location', ['imei' => $imei])->json();
    }

    public function sendCommand(string $imei, string $command): array
    {
        return $this->client()->post('/v3/command', [
            'imei' => $imei,
            'command' => $command,
        ])->json();
    }
}
