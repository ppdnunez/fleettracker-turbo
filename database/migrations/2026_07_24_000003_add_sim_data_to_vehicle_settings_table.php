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
        // SIM Data Management (Device module): the prepaid load/data balance that keeps a
        // tracker's SIM online expires independently of the vehicle's own paperwork, so it gets
        // the same expiry/notify-days/notified-at triad as the safety sticker fields above,
        // rather than a new table — see NotifySimDataExpirations.
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->string('sim_number')->nullable()->after('sticker_notified_at');
            $table->date('sim_data_expiry')->nullable()->after('sim_number');
            $table->unsignedInteger('sim_notify_days_before')->nullable()->after('sim_data_expiry');
            $table->date('sim_notified_at')->nullable()->after('sim_notify_days_before');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn(['sim_number', 'sim_data_expiry', 'sim_notify_days_before', 'sim_notified_at']);
        });
    }
};
