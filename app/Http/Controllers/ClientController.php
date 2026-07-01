<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Services\ClientProvisioningService;
use Illuminate\Http\Request;

// Client (SaaS tenant) management - super_admin only. Provisioning itself is delegated to
// ClientProvisioningService; this controller is just the HTTP boundary + the super_admin gate.
class ClientController extends Controller
{
    public function __construct(private ClientProvisioningService $provisioning)
    {
    }

    public function index(Request $request)
    {
        $this->assertSuperAdmin($request);

        return response()->json(
            Client::withCount('users')->orderBy('name')->get()
        );
    }

    public function store(Request $request)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'name'                  => 'required|string|max:255',
            'admin_name'            => 'required|string|max:255',
            'admin_email'           => 'required|email|unique:users,email',
            'admin_password'        => 'required|string|min:8',
            'devices'               => 'array',
            'devices.*.name'        => 'required_with:devices|string|max:255',
            'devices.*.uniqueId'    => 'required_with:devices|string|max:255',
        ]);

        $client = $this->provisioning->provision(
            $data['name'],
            $data['devices'] ?? [],
            $data['admin_name'],
            $data['admin_email'],
            $data['admin_password'],
        );

        return response()->json($client, 201);
    }

    public function update(Request $request, int $id)
    {
        $this->assertSuperAdmin($request);

        $client = Client::findOrFail($id);
        $data = $request->validate([
            'name'   => 'sometimes|string|max:255',
            'status' => 'sometimes|in:active,suspended',
        ]);
        $client->update($data);

        return response()->json($client);
    }

    private function assertSuperAdmin(Request $request): void
    {
        abort_if(!$request->user()?->isSuperAdmin(), 403, 'Only super admins can manage clients.');
    }
}
