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
        // TurboHive has no REST history endpoint for card-reader (RFID/iButton) taps — only a
        // live MQTT push on {userId}/peri/{imei} (messageType "dlt"). This table is therefore
        // the only system of record for check-ins; MqttWorker persists each one the moment it
        // arrives (see MqttWorker::connectAndListen).
        Schema::create('driver_checkins', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->string('driver_card_id');
            $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('checkin_time');
            $table->dateTime('server_time');
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->timestamps();
            $table->index(['imei', 'checkin_time']);
            $table->index(['driver_id', 'checkin_time']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('driver_checkins');
    }
};
