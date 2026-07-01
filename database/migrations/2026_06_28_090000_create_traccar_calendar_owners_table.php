<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Traccar has no native group/device permission link for calendars (unlike geofences,
    // notifications, drivers, commands, attributes, and maintenance, which all support a
    // `groupId` filter via /api/permissions) - so calendar ownership has to be tracked here
    // instead, purely on the FleetTrack side, to scope them per SaaS client.
    public function up(): void
    {
        Schema::create('traccar_calendar_owners', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('traccar_calendar_id')->unique();
            // null = created by a super_admin, treated as a global/shared calendar.
            $table->foreignId('client_id')->nullable()->constrained('clients')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('traccar_calendar_owners');
    }
};
