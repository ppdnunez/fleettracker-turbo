<?php

namespace App\Http\Controllers;

use App\Models\AlertRecipient;
use Illuminate\Http\Request;

class AlertRecipientController extends Controller
{
    public function index()
    {
        return response()->json(AlertRecipient::orderBy('email')->get());
    }

    public function store(Request $request)
    {
        $data = $this->validated($request, ['email' => 'required|email|max:255|unique:alert_recipients,email']);

        return response()->json(AlertRecipient::create($data), 201);
    }

    public function update(Request $request, AlertRecipient $alertRecipient)
    {
        $data = $this->validated($request, [
            'email' => "required|email|max:255|unique:alert_recipients,email,{$alertRecipient->id}",
        ]);

        $alertRecipient->update($data);
        return response()->json($alertRecipient);
    }

    public function destroy(AlertRecipient $alertRecipient)
    {
        $alertRecipient->delete();
        return response()->json(['message' => 'Alert recipient deleted.']);
    }

    private function validated(Request $request, array $emailRule): array
    {
        return $request->validate([
            ...$emailRule,
            'name'         => 'nullable|string|max:100',
            'categories'   => 'required|array|min:1',
            'categories.*' => 'string|in:' . implode(',', array_keys(AlertRecipient::CATEGORIES)),
            'active'       => 'boolean',
        ]);
    }
}
