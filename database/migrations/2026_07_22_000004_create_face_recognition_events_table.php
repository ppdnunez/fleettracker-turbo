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
        // One row per JC171 AFIF face-recognition check (alert.code 1823 = match / 1824 = no
        // match — see DeviceAlertReceived::KNOWN_CODE_NAMES). Deliberately separate from
        // driving-behavior alerts (13xx): this is a biometric authentication event, not a driving
        // infraction. Populated from MqttWorker's alert/# handler, mirroring GeofenceEvent's
        // "insert a row every time this fires" pattern. driver_id is best-effort only — TurboHive
        // doesn't report which specific enrolled face matched, so it's set only when exactly one
        // DriverFace is enrolled for the IMEI at the time (see MqttWorker for the exact rule).
        Schema::create('face_recognition_events', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('result', ['succeeded', 'failed']);
            // Raw evidence filenames reported directly on the alert payload (alert.file) — same
            // field AlertFileUpload reads for other alert codes, just not requested/uploaded here
            // (see MqttWorker::ALERT_FILE_UPLOAD_CODES, which excludes 1823/1824 on purpose).
            $table->json('file_names')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['imei', 'occurred_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('face_recognition_events');
    }
};
