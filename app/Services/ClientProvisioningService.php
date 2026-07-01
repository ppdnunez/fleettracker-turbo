<?php

namespace App\Services;

use App\Models\Client;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use RuntimeException;

// Provisions a new SaaS client end to end:
//   1. POST /api/groups   - create a Traccar group named after the client
//   2. POST /api/devices  - create each device with groupId = that group
//   3. POST /api/permissions {userId, groupId} - grant the client's admin visibility in Traccar
// Plus a FleetTrack login (role=admin, client_id=this client) - that's what actually enforces
// isolation for this app's own UI, via TraccarController::restrictedGroupId(). Step 3's userId has
// to be a Traccar user id (Traccar's own permission system, not our `users` table), so this also
// creates a matching Traccar user for the client admin - mirroring the boundary inside Traccar
// itself, in case the client is ever given direct Traccar access alongside FleetTrack's own UI.
class ClientProvisioningService
{
    private string $baseUrl;
    private array  $auth;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.traccar.url'), '/') . '/api';
        $this->auth    = [
            config('services.traccar.email'),
            config('services.traccar.password'),
        ];
    }

    /**
     * @param array<int, array{name: string, uniqueId: string}> $devices
     */
    public function provision(string $clientName, array $devices, string $adminName, string $adminEmail, string $adminPassword): Client
    {
        return DB::transaction(function () use ($clientName, $devices, $adminName, $adminEmail, $adminPassword) {
            // Step 1
            $groupResponse = Http::withBasicAuth(...$this->auth)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post("{$this->baseUrl}/groups", ['name' => $clientName, 'attributes' => (object) []]);
            if (!$groupResponse->successful()) {
                throw new RuntimeException('Failed to create Traccar group for client.');
            }
            $groupId = $groupResponse->json()['id'];

            $client = Client::create([
                'name'             => $clientName,
                'traccar_group_id' => $groupId,
                'status'           => 'active',
            ]);

            // Step 2
            foreach ($devices as $device) {
                $deviceResponse = Http::withBasicAuth(...$this->auth)
                    ->withHeaders(['Content-Type' => 'application/json'])
                    ->post("{$this->baseUrl}/devices", [
                        'name'       => $device['name'],
                        'uniqueId'   => $device['uniqueId'],
                        'groupId'    => $groupId,
                        'attributes' => (object) [],
                    ]);
                if (!$deviceResponse->successful()) {
                    throw new RuntimeException("Failed to create device \"{$device['name']}\" for client (group and any earlier devices were already created in Traccar).");
                }
            }

            // FleetTrack login - the real enforcement boundary for this app.
            $user = User::create([
                'name'      => $adminName,
                'email'     => $adminEmail,
                'password'  => Hash::make($adminPassword),
                'role'      => 'admin',
                'client_id' => $client->id,
            ]);

            // Step 3 - best-effort: if Traccar user creation fails (e.g. duplicate email already
            // registered directly in Traccar), the FleetTrack login above still works fine, since
            // it's the actual access boundary; only native Traccar-side access would be missing.
            $traccarUserResponse = Http::withBasicAuth(...$this->auth)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post("{$this->baseUrl}/users", [
                    'name'     => $adminName,
                    'email'    => $adminEmail,
                    'password' => $adminPassword,
                ]);
            if ($traccarUserResponse->successful()) {
                Http::withBasicAuth(...$this->auth)
                    ->withHeaders(['Content-Type' => 'application/json'])
                    ->post("{$this->baseUrl}/permissions", [
                        'userId'  => $traccarUserResponse->json()['id'],
                        'groupId' => $groupId,
                    ]);
            }

            unset($user);

            return $client->fresh();
        });
    }
}
