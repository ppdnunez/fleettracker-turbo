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
        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->string('badge_no')->unique();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('license_no')->nullable();
            $table->string('rfid_card_no')->nullable();
            $table->string('register_place')->nullable();
            $table->date('register_date')->nullable();
            $table->date('license_expiry')->nullable();
            $table->date('safety_sticker_expiry')->nullable();
            $table->unsignedSmallInteger('notify_days_before')->nullable();
            $table->enum('status', ['Active', 'Inactive'])->default('Active');
            // Traccar sync (Approach 2: local row is the source of truth, Traccar driver mirrors it).
            $table->integer('traccar_driver_id')->nullable();
            $table->string('traccar_unique_id')->nullable();
            // Dedup markers for the expiration-notice email: holds the expiry date a notice was
            // already sent for, so renewing the date re-arms the reminder but re-running the
            // scheduled check doesn't resend for the same date.
            $table->date('license_notified_at')->nullable();
            $table->date('sticker_notified_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('drivers');
    }
};
