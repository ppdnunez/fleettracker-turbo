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
        // A vehicle (TurboHive device, identified by IMEI — not a local `devices` row, mirrors
        // geofence_device's convention) can have multiple drivers assigned to it.
        Schema::create('driver_device', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->string('imei');
            $table->timestamps();
            $table->unique(['driver_id', 'imei']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('driver_device');
    }
};
