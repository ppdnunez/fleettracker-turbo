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
        // Tracks the last known inside/outside state per device+geofence link, so the MQTT
        // worker can detect a transition on each incoming position without re-scanning history.
        Schema::table('geofence_device', function (Blueprint $table) {
            $table->boolean('is_inside')->default(false)->after('imei');
        });

        Schema::create('geofence_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('geofence_id')->constrained()->cascadeOnDelete();
            $table->string('imei');
            $table->enum('type', ['enter', 'exit']);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamp('triggered_at');
            $table->timestamps();

            $table->index(['imei', 'triggered_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('geofence_events');

        Schema::table('geofence_device', function (Blueprint $table) {
            $table->dropColumn('is_inside');
        });
    }
};
