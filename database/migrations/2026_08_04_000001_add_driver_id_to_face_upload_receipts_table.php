<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Filenames the device sends are "<driver badge_no>-<name>.jpg" (EVENTSET,FACE,SHOT/GET's
        // own naming convention — see TurboHiveService's Face Recognition section). FaceUploadService
        // parses that to resolve the driver so an incoming photo can be linked back automatically.
        Schema::table('face_upload_receipts', function (Blueprint $table) {
            $table->foreignId('driver_id')->nullable()->after('imei')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('face_upload_receipts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('driver_id');
        });
    }
};
