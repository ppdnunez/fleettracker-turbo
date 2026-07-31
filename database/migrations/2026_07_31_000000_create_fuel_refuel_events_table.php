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
        // The Refuelling report used to be computed on the fly from TurboHive's GET /v3/obd
        // history every time someone opened it — TurboHive's OBD retention window is limited, so
        // older refuels became unrecoverable once it rolled off. This table is now the system of
        // record instead: MqttWorker watches every live fuel-level sensor reading per IMEI and
        // persists a row here the moment a rise of REFUEL_RISE_THRESHOLD% or more is seen between
        // two consecutive readings (same detection rule the old on-demand report used — see
        // MqttWorker::REFUEL_RISE_THRESHOLD).
        Schema::create('fuel_refuel_events', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->decimal('from_percent', 5, 2);
            $table->decimal('to_percent', 5, 2);
            $table->decimal('change_percent', 5, 2);
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
        Schema::dropIfExists('fuel_refuel_events');
    }
};
