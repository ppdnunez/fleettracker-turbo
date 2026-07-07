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
        'token'    => env('TURBOHIVE_TOKEN'),
    ],

    // Used by the mqtt:worker Artisan command (TCP connection, server-side only)
    'turbohive_mqtt' => [
        'host'      => env('TURBOHIVE_MQTT_HOST', 'turbohive.ai'),
        'port'      => env('TURBOHIVE_MQTT_PORT', 1883),
        'username'  => env('TURBOHIVE_MQTT_USERNAME'),
        'password'  => env('TURBOHIVE_MQTT_PASSWORD'),
        'client_id' => env('TURBOHIVE_MQTT_CLIENT_ID', 'fleettrack-worker'),
        'user_id'   => env('TURBOHIVE_MQTT_USER_ID'),
    ],

    // Recipient for geofence enter/exit email alerts — see GeofenceMonitorService::checkPosition
    'geofence' => [
        'alert_email' => env('GEOFENCE_ALERT_EMAIL'),
    ],
];
