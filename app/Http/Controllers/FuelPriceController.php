<?php

namespace App\Http\Controllers;

use App\Models\FuelPrice;
use Illuminate\Http\Request;

// Petrol/diesel price history — each entry is a new row (never edited in place), so the "current"
// price for a fuel type is simply its most recent entry; the frontend (FuelPricePage.jsx) derives
// that from the same ordered list this returns rather than a separate endpoint. Used by the Fuel
// Price module under Fleet > Fuel Management to track fuel cost over time.
class FuelPriceController extends Controller
{
    public function index(Request $request)
    {
        $query = FuelPrice::query();

        if ($request->filled('fuelType')) {
            $query->where('fuel_type', $request->query('fuelType'));
        }

        return response()->json(
            $query->orderByDesc('effective_date')->orderByDesc('created_at')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'fuel_type'        => 'required|string|in:petrol,diesel',
            'price_per_liter'  => 'required|numeric|min:0|max:9999.99',
            'effective_date'   => 'nullable|date',
        ]);

        $record = FuelPrice::create([
            'fuel_type'       => $data['fuel_type'],
            'price_per_liter' => $data['price_per_liter'],
            'effective_date'  => $data['effective_date'] ?? now()->toDateString(),
        ]);

        return response()->json($record, 201);
    }

    public function destroy(FuelPrice $fuelPrice)
    {
        $fuelPrice->delete();

        return response()->json(['message' => 'Fuel price entry deleted.']);
    }
}
