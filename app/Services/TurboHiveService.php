<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class TurboHiveService
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

    public function getAlerts(array $params = [])
    {
        return $this->client()->get('/v3/alerts', $params)->json();
    }

    public function getTagLocation(string $imei)
    {
        return $this->client()->get('/v3/tag/location', ['imei' => $imei])->json();
    }

    public function fetchEventVideo(string $imei, int $alertTime)
    {
        return $this->client()->get('/v3/alerts/video/fetch', [
            'imei' => $imei,
            'alertTime' => $alertTime,
        ])->json();
    }

    public function fetchAlertVideo(string $imei, int $alertTimeMs)
    {
        return $this->client()->get('/v3/alerts/video/fetch', [
            'imei' => $imei,
            'alertTime' => $alertTimeMs,
        ]);
    }
}
