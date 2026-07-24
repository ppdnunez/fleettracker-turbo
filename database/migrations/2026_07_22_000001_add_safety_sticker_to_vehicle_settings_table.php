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
        // Moved from drivers (see the same-day remove_safety_sticker_from_drivers_table
        // migration) — a safety inspection sticker belongs to the vehicle, not whichever driver
        // happens to be assigned. sticker_notified_at is the same dedup-by-value pattern as
        // Driver::license_notified_at: holds the expiry date a notice was already sent for, so
        // renewing the date re-arms the reminder but re-running the scheduled check doesn't resend.
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->date('safety_sticker_expiry')->nullable()->after('vehicle_type');
            $table->unsignedSmallInteger('sticker_notify_days_before')->nullable()->after('safety_sticker_expiry');
            $table->date('sticker_notified_at')->nullable()->after('sticker_notify_days_before');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn(['safety_sticker_expiry', 'sticker_notify_days_before', 'sticker_notified_at']);
        });
    }
};
