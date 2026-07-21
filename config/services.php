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
        // Shared-secret path token guarding the public face-photo upload webhook (DriverFaceController::upload).
        'face_upload_token' => env('TURBOHIVE_FACE_UPLOAD_TOKEN'),
        // alert.code (on {userId}/alert/{imei}) that JC171 pushes for "AFIF face check found no
        // match" — confirmed 2026-07-16 from a live device push (alert.type 213, code "1824").
        // Arms MqttWorker's face-based relay-disconnect path (see UnregisteredDriverAlertService).
        // Left null if unset so nothing fires without a confirmed code on file.
        'face_unrecognized_alert_code' => env('TURBOHIVE_FACE_UNRECOGNIZED_ALERT_CODE', '1824'),
        // alert.code for "AFIF face check found a match" (code "1823", per TurboHive's alert
        // catalog). Arms MqttWorker's relay-reconnect path (see DriverRecognizedAlertService) —
        // the complement to face_unrecognized_alert_code's disconnect.
        'face_recognized_alert_code' => env('TURBOHIVE_FACE_RECOGNIZED_ALERT_CODE', '1823'),
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

    // Shared-secret path token guarding the public GPS file-upload webhook (GpsFileUploadController) —
    // the HTTP replacement for the FTPGPS FTP site, exposed over ngrok.
    'gps_upload' => [
        'token' => env('GPS_UPLOAD_TOKEN'),
    ],
];
