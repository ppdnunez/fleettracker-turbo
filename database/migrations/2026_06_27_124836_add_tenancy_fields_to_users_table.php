<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('client_id')->nullable()->after('role')->constrained('clients')->nullOnDelete();
        });

        DB::statement("ALTER TABLE users MODIFY role ENUM('super_admin','admin','operator','viewer') NOT NULL DEFAULT 'operator'");

        // No tenancy existed before this migration, so the one pre-existing admin account already
        // saw every device - promote it to super_admin so that access doesn't regress.
        DB::table('users')->where('role', 'admin')->update(['role' => 'super_admin']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('users')->where('role', 'super_admin')->update(['role' => 'admin']);
        DB::statement("ALTER TABLE users MODIFY role ENUM('admin','operator','viewer') NOT NULL DEFAULT 'operator'");

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['client_id']);
            $table->dropColumn('client_id');
        });
    }
};
