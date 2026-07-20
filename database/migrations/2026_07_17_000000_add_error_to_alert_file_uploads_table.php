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
        // Failure message for a request/retry — mirrors the pattern already used on
        // DriverFace/VehicleMaintenance. Needed now that uploads can also be manually re-triggered
        // (AlertFileUploadController::store) from the live alert feed, not just automatically from
        // MqttWorker, so a failed manual attempt has somewhere to record why.
        Schema::table('alert_file_uploads', function (Blueprint $table) {
            $table->text('error')->nullable()->after('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('alert_file_uploads', function (Blueprint $table) {
            $table->dropColumn('error');
        });
    }
};
