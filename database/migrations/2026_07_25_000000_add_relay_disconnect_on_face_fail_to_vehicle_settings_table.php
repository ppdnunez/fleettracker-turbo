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
        // Splits the single relay_disconnect_enabled toggle (which UnregisteredDriverAlertService
        // fires for both an unrecognized RFID/iButton tap and a failed face-recognition check) into
        // two independent opt-ins, so a vehicle can immobilize on one trigger without the other —
        // see UnregisteredDriverAlertService::handle's per-$source gate.
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->boolean('relay_disconnect_on_face_fail')->default(false)->after('relay_disconnect_enabled');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_settings', function (Blueprint $table) {
            $table->dropColumn('relay_disconnect_on_face_fail');
        });
    }
};
