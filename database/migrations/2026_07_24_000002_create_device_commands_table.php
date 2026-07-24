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
        // One row per IMEI per batch send (see TurboHiveController::batchSendCommand) — TurboHive's
        // own /v3/command/batchSend has no history endpoint, so this is the app's local record of
        // what was sent and its outcome, used by the Command module's Command History table.
        Schema::create('device_commands', function (Blueprint $table) {
            $table->id();
            $table->string('batch_id')->nullable()->index();
            $table->string('imei')->index();
            $table->text('content');
            $table->string('message_format')->default('text'); // text|hex
            $table->boolean('is_manual')->default(true);
            $table->string('mode')->default('async'); // sync|async
            $table->string('status')->default('pending'); // pending|success|failed|timeout
            $table->json('response')->nullable(); // per-device result object from TurboHive, or the raw batch response if none
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_commands');
    }
};
