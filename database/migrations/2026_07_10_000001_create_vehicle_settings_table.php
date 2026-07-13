<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Per-vehicle settings, keyed by TurboHive IMEI (vehicles have no local `devices` row —
        // same convention as driver_device/geofence_device). Currently just the relay-disconnect
        // opt-in: immobilizing a vehicle is high-impact, so it must be explicitly armed per vehicle
        // rather than firing for every unregistered card tap fleet-wide. See
        // UnregisteredDriverAlertService, triggered from MqttWorker's peri/dlt handler.
        Schema::create('vehicle_settings', function (Blueprint $table) {
            $table->id();
            $table->string('imei')->unique();
            $table->boolean('relay_disconnect_enabled')->default(false);
            $table->unsignedTinyInteger('relay_channel')->default(10);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicle_settings');
    }
};
