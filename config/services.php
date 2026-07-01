<?php

return [
    'gps' => [
        'provider' => env('GPS_PROVIDER', 'traccar'),
    ],
    'traccar' => [
        'url'      => env('TRACCAR_URL', 'http://localhost:8082'),
        'email'    => env('TRACCAR_EMAIL', 'admin@traccar.org'),
        'password' => env('TRACCAR_PASSWORD', 'admin'),
    ],
    'turbohive' => [
        'base_url' => env('TURBOHIVE_BASE_URL', 'https://turbohive.ai/api'),
        'token' => env('TURBOHIVE_TOKEN'),
    ],
];
