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
        // Cosmetic classification for map pin / device list icons (car, suv, truck, van, bus,
        // motorcycle) — distinct from TurboHive's own deviceType field (OBD/Dashcam, a hardware
        // classification used to filter dashcams out of trackable-device lists). Nullable: a
        // vehicle without one set falls back to the default pin icon.
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->string('vehicle_type')->nullable()->after('fuel_tank_capacity_liters');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn('vehicle_type');
        });
    }
};
