<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\DriverCheckinController;
use App\Http\Controllers\DriverController;
use App\Http\Controllers\GeofenceController;
use App\Http\Controllers\TurboHiveController;
use App\Http\Controllers\VehicleDriverController;

// Public
Route::post('/login',  [AuthController::class, 'login']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user',    [AuthController::class, 'me']);

    Route::apiResource('devices', DeviceController::class);
    Route::apiResource('drivers', DriverController::class)->except(['show']);
    Route::apiResource('geofences', GeofenceController::class)->except(['show']);
    Route::post('/geofences/{geofence}/devices',        [GeofenceController::class, 'linkDevice']);
    Route::delete('/geofences/{geofence}/devices/{imei}', [GeofenceController::class, 'unlinkDevice']);
    Route::get('/clients',      [ClientController::class, 'index']);
    Route::post('/clients',     [ClientController::class, 'store']);
    Route::put('/clients/{id}', [ClientController::class, 'update']);

    // Vehicle <-> Driver assignment (by TurboHive IMEI) — a vehicle can have multiple drivers
    Route::get('/vehicle-drivers/{imei}', [VehicleDriverController::class, 'index']);
    Route::put('/vehicle-drivers/{imei}', [VehicleDriverController::class, 'sync']);

    // Driver check-ins (RFID/iButton card taps) — captured live via MqttWorker from
    // {userId}/peri/#, since TurboHive has no REST history endpoint for this data.
    Route::get('/driver-checkins', [DriverCheckinController::class, 'index']);

    // Traccar routes disabled — TurboHive is the primary GPS provider

    Route::prefix('turbohive')->group(function () {
        // Config
        Route::get('/mqtt-config', [TurboHiveController::class, 'mqttConfig']);

        // Devices  →  GET /v3/devices/page
        Route::get('/devices',               [TurboHiveController::class, 'devices']);
        Route::post('/devices/status',       [TurboHiveController::class, 'deviceStatus']);
        Route::post('/devices/import',       [TurboHiveController::class, 'importDevice']);
        Route::get('/devices/{id}',          [TurboHiveController::class, 'deviceDetail'])->where('id', '[0-9]+');
        Route::delete('/devices/{id}',       [TurboHiveController::class, 'destroyDevice'])->where('id', '[0-9]+');

        // Device catalog  →  GET /v3/vendors, GET /v3/models
        Route::get('/vendors',                [TurboHiveController::class, 'vendors']);
        Route::get('/models',                 [TurboHiveController::class, 'models']);

        // Location  →  POST /v3/track/location
        Route::get('/locations',              [TurboHiveController::class, 'allLocations']);
        Route::get('/device/{imei}/location', [TurboHiveController::class, 'location']);
        Route::get('/positioning-battery',    [TurboHiveController::class, 'positioningBattery']);

        // Mileage  →  GET /v3/mileage/realtime   ?page=&size=&keyword=
        Route::get('/mileage/realtime',      [TurboHiveController::class, 'realtimeMileage']);

        // Track  →  GET /v3/track   ?imei=&startTime=&endTime=
        Route::get('/device/{imei}/track',      [TurboHiveController::class, 'track']);

        // Track (unpaginated, for Replay)  →  GET /v3/track/list   ?imei=&startTime=&endTime=
        Route::get('/device/{imei}/track-list', [TurboHiveController::class, 'trackList']);

        // Trips  →  GET /v3/trip/list   ?imei=&startTime=&endTime=
        Route::get('/device/{imei}/trips',   [TurboHiveController::class, 'trips']);

        // Alerts  →  GET /v3/alerts/page
        Route::get('/alerts',                [TurboHiveController::class, 'alerts']);

        // Battery  →  POST /v3/command/send  (status# query, parsed)
        Route::get('/device/{imei}/battery', [TurboHiveController::class, 'batteryStatus']);

        // OBD (external battery / vehicle telemetry)  →  GET /v3/obd
        Route::get('/device/{imei}/obd',     [TurboHiveController::class, 'obdData']);

        // Commands  →  POST /v3/command/send
        Route::post('/command',              [TurboHiveController::class, 'sendCommand']);

        // Live video  →  POST /v3/video/live/start|stop
        Route::post('/video/start',          [TurboHiveController::class, 'videoStart']);
        Route::post('/video/stop',           [TurboHiveController::class, 'videoStop']);

        // Video files  →  POST /v3/video/files/list
        Route::post('/video/files',          [TurboHiveController::class, 'videoFiles']);

        // Playback  →  POST /v3/video/playback/start|stop
        Route::post('/video/playback/start', [TurboHiveController::class, 'playbackStart']);
        Route::post('/video/playback/stop',  [TurboHiveController::class, 'playbackStop']);

        // Capture  →  POST /v3/video/capture/start
        Route::post('/video/capture',        [TurboHiveController::class, 'captureStart']);
    });
});
