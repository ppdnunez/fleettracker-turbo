<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Correlates an EVENTSET,FACE,SHOT command (DriverFaceController::enroll()) to its later
        // async result on {userId}/notify/# (see MqttWorker::recordFaceShotResult()) — same pattern
        // as alert_file_uploads.cmd_no.
        Schema::table('driver_faces', function (Blueprint $table) {
            $table->string('cmd_no')->nullable()->after('imei');
        });
    }

    public function down(): void
    {
        Schema::table('driver_faces', function (Blueprint $table) {
            $table->dropColumn('cmd_no');
        });
    }
};
