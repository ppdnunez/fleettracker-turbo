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
        // Per-link alert preference — GeofenceMonitorService checks this before emailing on a
        // transition (the GeofenceEvent record and live broadcast still always fire either way,
        // for history/map purposes; only the email is gated). Defaults to 'both' so existing links
        // keep notifying exactly as they do today.
        Schema::table('geofence_device', function (Blueprint $table) {
            $table->enum('alert_direction', ['enter', 'exit', 'both'])->default('both')->after('imei');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('geofence_device', function (Blueprint $table) {
            $table->dropColumn('alert_direction');
        });
    }
};
