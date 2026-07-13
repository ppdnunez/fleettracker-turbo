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
        // Local (Laravel DB) maintenance schedule/history per vehicle, keyed by TurboHive IMEI —
        // same convention as vehicle_settings, since vehicles have no local `devices` row. See
        // NotifyVehicleMaintenanceDue for the scheduled reminder that reads due_date/due_odometer_km.
        Schema::create('vehicle_maintenances', function (Blueprint $table) {
            $table->id();
            $table->string('imei');
            $table->string('maintenance_type');
            $table->text('description')->nullable();
            $table->enum('status', ['Scheduled', 'Completed', 'Cancelled'])->default('Scheduled');

            $table->date('due_date')->nullable();
            $table->decimal('due_odometer_km', 10, 2)->nullable();
            $table->unsignedSmallInteger('notify_days_before')->nullable();
            $table->unsignedInteger('notify_km_before')->nullable();

            $table->date('completed_date')->nullable();
            $table->decimal('completed_odometer_km', 10, 2)->nullable();
            $table->decimal('cost', 10, 2)->nullable();
            $table->string('vendor')->nullable();
            $table->text('notes')->nullable();

            // Dedup markers for the maintenance-due reminder email: hold the due value a notice was
            // already sent for (mirrors drivers.license_notified_at/sticker_notified_at — see that
            // migration's comment for why a notified *value* is stored rather than a boolean).
            // Editing due_date/due_odometer_km naturally re-arms the reminder since the stored
            // value no longer matches.
            $table->date('notified_due_date')->nullable();
            $table->decimal('notified_due_odometer_km', 10, 2)->nullable();

            $table->timestamps();
            $table->index(['imei', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicle_maintenances');
    }
};
