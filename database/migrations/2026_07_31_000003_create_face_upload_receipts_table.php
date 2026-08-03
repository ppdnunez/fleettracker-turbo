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
        // Inbound log for our own re-implementation of TurboHive's device-facing face image
        // ingest API (POST /face/uploadPic — see face-upload-api.md). Devices are pointed here
        // (instead of TurboHive's own host) via DriverFaceController::setUploadUrl, which sends
        // UPLOADFACE,<our host># to the device. Every request is recorded here — including
        // rejected ones — so the admin UI can show exactly what response we sent back.
        Schema::create('face_upload_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('imei')->nullable();
            $table->string('instruction_id')->nullable();
            $table->string('file_name')->nullable();
            $table->string('stored_path')->nullable();
            $table->boolean('signature_valid')->nullable();
            $table->unsignedSmallInteger('response_code');
            $table->string('response_message');
            $table->string('ip')->nullable();

            $table->timestamps();

            $table->index(['imei', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('face_upload_receipts');
    }
};
