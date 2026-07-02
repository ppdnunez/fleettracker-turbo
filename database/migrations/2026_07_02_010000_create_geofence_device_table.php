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
        // Mirrors Traccar's separate /api/permissions step: a geofence is only ever checked
        // against devices explicitly linked here (by TurboHive IMEI, not a local device id —
        // TurboHive devices live in the external API, not a local `devices` row).
        Schema::create('geofence_device', function (Blueprint $table) {
            $table->id();
            $table->foreignId('geofence_id')->constrained()->cascadeOnDelete();
            $table->string('imei');
            $table->timestamps();
            $table->unique(['geofence_id', 'imei']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('geofence_device');
    }
};
