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
        // Same rationale as fuel_refuel_events (see that migration) — persisted by MqttWorker so
        // history survives past TurboHive's own OBD retention window, instead of the old on-demand
        // GET /v3/obd re-scan the Abnormal Loss report used to do on every search. A row is saved
        // when a fuel-level drop of at least MqttWorker::ABNORMAL_DROP_THRESHOLD% happens between
        // two consecutive readings while the vehicle travelled under ABNORMAL_DROP_MAX_KM km —
        // level dropping fast with the vehicle essentially stationary reads as a leak/siphon, not
        // normal consumption while driving. See MqttWorker::detectAbnormalLoss.
        Schema::create('fuel_abnormal_loss_events', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->decimal('from_percent', 5, 2);
            $table->decimal('to_percent', 5, 2);
            $table->decimal('change_percent', 5, 2);
            $table->decimal('from_odometer_km', 10, 2)->nullable();
            $table->decimal('to_odometer_km', 10, 2)->nullable();
            $table->decimal('distance_km', 10, 2)->nullable();
            $table->dateTime('detected_at');
            $table->timestamps();
            $table->index(['imei', 'detected_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fuel_abnormal_loss_events');
    }
};
