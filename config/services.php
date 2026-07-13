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
        // match". Not confirmed against a real device/vendor doc — left unset (null) by default so
        // nothing fires on a guessed code. Capture the real value from a live unrecognized-face
        // event (same way 1401/1402/1501/1002 were captured for DeviceAlertReceived's
        // KNOWN_CODE_NAMES) and set it here to arm MqttWorker's face-based relay-disconnect path.
        'face_unrecognized_alert_code' => env('TURBOHIVE_FACE_UNRECOGNIZED_ALERT_CODE'),
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

    // Recipient for unregistered-driver-tap email alerts — see UnregisteredDriverAlertService
    'driver_checkin' => [
        'alert_email' => env('DRIVER_CHECKIN_ALERT_EMAIL'),
    ],
];
