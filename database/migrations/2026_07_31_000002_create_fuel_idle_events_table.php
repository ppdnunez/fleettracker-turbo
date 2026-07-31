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
        // Same rationale as fuel_refuel_events (see that migration). One row per completed idle
        // run — MqttWorker starts a run the moment a device's live speed reading drops to/below
        // MqttWorker::IDLE_SPEED_KMH, and closes + saves it once speed rises back above that
        // threshold, using the OBD totalFuelConsumption totalizer delta across the run for
        // fuel_used (same "confirmed totalizer" approach the old on-demand Idle Fuel report used —
        // see MqttWorker::detectIdleFuel).
        Schema::create('fuel_idle_events', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->dateTime('start_time');
            $table->dateTime('end_time');
            $table->decimal('fuel_used', 10, 2)->nullable();
            $table->timestamps();
            $table->index(['imei', 'start_time']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fuel_idle_events');
    }
};
