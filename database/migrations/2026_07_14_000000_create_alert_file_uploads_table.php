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
        // Tracks the JC171 "alert has evidence files" round-trip described in the TH Integration
        // Guide: an alert arrives on {userId}/alert/{imei} with alert.file listing filenames still
        // sitting on-device (not yet uploaded anywhere); MqttWorker requests the device push them
        // via an UPLOADFILE command (TurboHiveService::requestAlertFileUpload), creating a row here
        // with status=requested. The device later uploads and TurboHive confirms on
        // {userId}/notify/{imei} (notify.event=captureUploadCompleted); MqttWorker matches that
        // back to the pending row (best-effort, by imei + overlapping file names — TurboHive's
        // cmd.no isn't confirmed to correspond to anything captured at request time) and fills in
        // uploaded_file_path/uploaded_at. If no pending row matches, the notification still gets
        // its own row rather than being dropped.
        Schema::create('alert_file_uploads', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->integer('alert_type')->nullable();
            $table->string('alert_code')->nullable();
            $table->dateTime('alert_time')->nullable();
            $table->json('file_names');
            $table->double('longitude')->nullable();
            $table->double('latitude')->nullable();

            $table->enum('status', ['requested', 'uploaded', 'failed'])->default('requested');
            $table->json('uploaded_file_list')->nullable();
            $table->string('uploaded_file_path')->nullable();
            $table->unsignedBigInteger('uploaded_file_size')->nullable();
            $table->string('upload_result')->nullable();
            $table->string('cmd_no')->nullable();

            $table->dateTime('requested_at')->nullable();
            $table->dateTime('uploaded_at')->nullable();
            $table->timestamps();

            $table->index(['imei', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('alert_file_uploads');
    }
};
