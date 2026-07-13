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
        // Per-vehicle inputs for the Fuel Management > Consumption tab's rate-based and
        // sensor-based methods (see ReportPage.jsx's FuelConsumption component): fuel_rate is
        // multiplied by OBD odometer distance directly; fuel_tank_capacity converts an OBD/sensor
        // fuel-level percentage drop into liters. Both nullable — a vehicle without them configured
        // just can't use that particular method yet (the report shows a prompt to set it).
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->decimal('fuel_rate_l_per_100km', 6, 2)->nullable()->after('relay_channel');
            $table->decimal('fuel_tank_capacity_liters', 7, 2)->nullable()->after('fuel_rate_l_per_100km');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn(['fuel_rate_l_per_100km', 'fuel_tank_capacity_liters']);
        });
    }
};
