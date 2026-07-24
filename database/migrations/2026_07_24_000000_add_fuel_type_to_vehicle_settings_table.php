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
        // What the vehicle actually burns — distinct from vehicle_type (cosmetic map-pin
        // classification). Feeds the Fuel Price module (ReportPage/FuelPricePage) so a vehicle's
        // running cost can be computed from its own fuel type's current price rather than a single
        // fleet-wide rate. Nullable: a vehicle without one set just can't be matched to a price yet.
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->string('fuel_type')->nullable()->after('vehicle_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn('fuel_type');
        });
    }
};
