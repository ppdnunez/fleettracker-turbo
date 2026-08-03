<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('face_upload_receipts', function (Blueprint $table) {
            $table->string('user_agent')->nullable()->after('ip');
        });
    }

    public function down(): void
    {
        Schema::table('face_upload_receipts', function (Blueprint $table) {
            $table->dropColumn('user_agent');
        });
    }
};
