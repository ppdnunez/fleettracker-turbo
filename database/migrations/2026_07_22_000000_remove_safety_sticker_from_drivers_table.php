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
        // Safety sticker is a vehicle-inspection artifact, not a driver credential — moved to
        // vehicle_settings (see the same-day add_safety_sticker_to_vehicle_settings_table
        // migration) so it's keyed by IMEI instead of by driver.
        Schema::table('drivers', function (Blueprint $table) {
            $table->dropColumn(['safety_sticker_expiry', 'sticker_notified_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            $table->date('safety_sticker_expiry')->nullable()->after('license_expiry');
            $table->date('sticker_notified_at')->nullable()->after('license_notified_at');
        });
    }
};
