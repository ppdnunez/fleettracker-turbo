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
        // One row per TurboHive fuel-sensor alert (alert.code 1222-1225 — see
        // DeviceAlertReceived::KNOWN_CODE_NAMES for the name/trigger_type/severity/description each
        // code carries). Populated live by MqttWorker's alert/# handler, same "insert a row every
        // time this fires" pattern as face_recognition_events/geofence_events. Vehicle-level, not
        // driver-level, so there's no driver_id here.
        Schema::create('fuel_alerts', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->string('code');
            $table->string('type'); // e.g. "Low Fuel", "Fuel Level Abnormal"
            $table->string('trigger_type'); // "event" | "stateful"
            $table->string('severity'); // "low" | "medium" | "high"
            $table->string('description')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['imei', 'occurred_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fuel_alerts');
    }
};
