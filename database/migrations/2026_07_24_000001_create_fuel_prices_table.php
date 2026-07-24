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
        // Every price entry is kept (never updated in place) so this table doubles as the history
        // — the "current" price for a fuel_type is just its most recent row by effective_date, then
        // created_at as a tiebreaker for same-day entries. See FuelPriceController.
        Schema::create('fuel_prices', function (Blueprint $table) {
            $table->id();
            $table->string('fuel_type');
            $table->decimal('price_per_liter', 8, 2);
            $table->date('effective_date');
            $table->timestamps();

            $table->index(['fuel_type', 'effective_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('fuel_prices');
    }
};
