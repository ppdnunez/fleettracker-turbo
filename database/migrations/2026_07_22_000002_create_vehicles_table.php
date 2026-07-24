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
        // FleetTrack's own vehicle registry, mirroring the drivers table's role for the Driver
        // module: a real local row per vehicle, one-to-one with a TurboHive IMEI (`imei` is
        // unique, unlike driver_device's many-per-driver pivot). `name` is deliberately separate
        // from TurboHive's own deviceName — that field belongs to the tracker hardware record, not
        // the vehicle profile. Adding a vehicle here is what makes its IMEI "linked"; any IMEI not
        // present in this table shows up as available to bind in the Add Vehicle picker.
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('imei')->unique();
            $table->string('name');
            $table->string('plate_number')->nullable();
            $table->string('manufacturer')->nullable();
            $table->string('model')->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->string('color')->nullable();
            $table->enum('status', ['Active', 'Inactive'])->default('Active');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
