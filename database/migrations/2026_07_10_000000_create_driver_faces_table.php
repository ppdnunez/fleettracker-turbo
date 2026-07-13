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
        // Face enrollment happens on the JC171 device itself (EVENTSET,FACE,SHOT captures and
        // stores the photo locally on-device) — TurboHive has no REST record of it. This table is
        // FleetTrack's own tracking of what we've asked each device to enroll/delete, plus the
        // photo once the device uploads it back to our own webhook (see DriverFaceController::upload).
        Schema::create('driver_faces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->string('imei');
            $table->enum('status', ['pending', 'enrolled', 'failed', 'deleted'])->default('pending');
            $table->string('photo_path')->nullable();
            $table->text('error')->nullable();
            $table->dateTime('requested_at')->nullable();
            $table->dateTime('enrolled_at')->nullable();
            $table->timestamps();

            $table->unique(['driver_id', 'imei']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('driver_faces');
    }
};
