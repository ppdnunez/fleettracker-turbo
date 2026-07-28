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
        // Same dedup-by-value pattern as sticker_notified_at/license_notified_at: holds the expiry
        // date a notice was already sent for, so renewing the date re-arms the reminder without
        // resending on every scheduled check.
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->date('insurance_expiry')->nullable()->after('sticker_notified_at');
            $table->unsignedSmallInteger('insurance_notify_days_before')->nullable()->after('insurance_expiry');
            $table->date('insurance_notified_at')->nullable()->after('insurance_notify_days_before');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn(['insurance_expiry', 'insurance_notify_days_before', 'insurance_notified_at']);
        });
    }
};
