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
        // Central subscriber list for every alert email this app sends (see
        // App\Models\AlertRecipient::CATEGORIES) — replaces the two single-address .env configs
        // (services.geofence.alert_email, services.driver_checkin.alert_email) and the
        // "email every registered User" fallback previously used by driver-expiry and
        // vehicle-maintenance reminders. `categories` is a JSON list rather than a pivot table:
        // with only 4 fixed categories and no per-category metadata, a pivot row per (email,
        // category) pair buys nothing a JSON column doesn't already give AlertRecipient::emailsFor().
        Schema::create('alert_recipients', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            $table->string('name')->nullable();
            $table->json('categories');
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique('email');
        });

        $this->seedFromExistingConfig();
    }

    /**
     * One-time carry-over so switching to the new table doesn't silently stop any alert that was
     * already going out: the two hardcoded .env addresses keep their categories, and everyone who
     * was previously blanket-emailed as a registered User for expiry/maintenance reminders gets an
     * explicit row for those two categories. Merged by email (a user who is also the geofence
     * contact ends up with one row covering all four categories) since `email` is unique.
     */
    private function seedFromExistingConfig(): void
    {
        $byEmail = [];
        $add = function (?string $email, array $categories) use (&$byEmail) {
            $email = trim((string) $email);
            if ($email === '') {
                return;
            }
            $byEmail[$email] = array_values(array_unique([...($byEmail[$email] ?? []), ...$categories]));
        };

        $add(env('GEOFENCE_ALERT_EMAIL'), ['geofence']);
        $add(env('DRIVER_CHECKIN_ALERT_EMAIL'), ['driver_checkin']);

        foreach (DB::table('users')->pluck('email') as $email) {
            $add($email, ['driver_expiry', 'vehicle_maintenance']);
        }

        $now = now();
        foreach ($byEmail as $email => $categories) {
            DB::table('alert_recipients')->insert([
                'email'      => $email,
                'name'       => null,
                'categories' => json_encode($categories),
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('alert_recipients');
    }
};
