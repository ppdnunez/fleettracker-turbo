<?php

namespace App\Http\Controllers;

use App\Models\TraccarCalendarOwner;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

class TraccarController extends Controller
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

    /* ── Multi-tenancy ───────────────────────────────────────────────────────────────────────
     * Every Traccar call in this controller goes out under the one shared admin credential above,
     * which can see every device/group on the server - so tenant isolation between SaaS clients
     * has to be enforced here, not by Traccar. A non-super_admin user is restricted to their
     * client's traccar_group_id (set at provisioning time, see ClientProvisioningService); a
     * super_admin or a user with no client_id is unrestricted. Every device-list fetch and every
     * by-id device endpoint in this controller routes through the helpers below. */

    private function restrictedGroupId(): ?int
    {
        $user = request()->user();
        if (!$user || $user->isSuperAdmin()) {
            return null;
        }
        return $user->client?->traccar_group_id;
    }

    // Devices list, filtered to the caller's client group (or unfiltered for super_admin).
    private function scopedDevices(): array
    {
        $devices = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        $groupId = $this->restrictedGroupId();
        if ($groupId === null) {
            return $devices;
        }
        return array_values(array_filter($devices, fn ($d) => ($d['groupId'] ?? null) === $groupId));
    }

    // Positions list, filtered down to devices the caller's client owns.
    private function scopedPositions(): array
    {
        $positions = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions")->json() ?? [];
        $groupId = $this->restrictedGroupId();
        if ($groupId === null) {
            return $positions;
        }
        $allowedIds = array_column($this->scopedDevices(), 'id');
        return array_values(array_filter($positions, fn ($p) => in_array($p['deviceId'] ?? null, $allowedIds, true)));
    }

    // Any array of Traccar rows carrying a deviceId (events/positions/trips/stops/...) - drops
    // rows for devices outside the caller's client group. Report methods call this right after
    // fetching from Traccar, since those endpoints have no group filter of their own and would
    // otherwise return every client's data when no specific deviceId is requested.
    private function filterRowsToScope(array $rows): array
    {
        $groupId = $this->restrictedGroupId();
        if ($groupId === null) {
            return $rows;
        }
        $allowedIds = array_column($this->scopedDevices(), 'id');
        return array_values(array_filter($rows, fn ($r) => in_array($r['deviceId'] ?? null, $allowedIds, true)));
    }

    // Guard for endpoints that take a specific device id directly (position/route/trips/connections/
    // update...) - 403s if that device doesn't belong to the caller's client.
    private function assertDeviceAccessible(int $deviceId): void
    {
        $groupId = $this->restrictedGroupId();
        if ($groupId === null) {
            return;
        }
        $device = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices", ['id' => $deviceId])->json()[0] ?? null;
        abort_if(!$device || ($device['groupId'] ?? null) !== $groupId, 403, 'You do not have access to this device.');
    }

    // geofences/notifications/(native)drivers/commands/computed-attributes/maintenance all extend
    // Traccar's ExtendedObjectResource, which supports a `groupId` query param that returns only
    // the rows linked to that group via /api/permissions - same mechanism groupConnections()
    // already relies on. Calendars don't support this (see TraccarCalendarOwner) - everything
    // else funnels through here.
    private function scopedGroupList(string $path): array
    {
        $groupId = $this->restrictedGroupId();
        $query = $groupId !== null ? ['groupId' => $groupId] : [];
        return Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/{$path}", $query)->json() ?? [];
    }

    // Guard for by-id update/destroy endpoints on those same resource types - 403s unless the
    // resource is linked to the caller's client group.
    private function assertGroupResourceAccessible(string $path, int $resourceId): void
    {
        $groupId = $this->restrictedGroupId();
        if ($groupId === null) {
            return;
        }
        $linked = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/{$path}", ['groupId' => $groupId])->json() ?? [];
        abort_if(!in_array($resourceId, array_column($linked, 'id'), true), 403, 'You do not have access to this resource.');
    }

    // Traccar's POST /{resource} never auto-links the new row to anything - without this, a
    // restricted user's own newly-created geofence/notification/etc. would be invisible in their
    // own scopedGroupList() right after creating it, since nothing would have linked it to their
    // group yet.
    private function autoLinkToOwnGroup(string $connectionType, int $resourceId): void
    {
        $groupId = $this->restrictedGroupId();
        if ($groupId === null) {
            return;
        }
        Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/permissions", [
                'groupId' => $groupId,
                self::CONNECTION_KEYS[$connectionType] => $resourceId,
            ]);
    }

    public function devices()
    {
        return response()->json($this->scopedDevices());
    }

    public function storeDevice(Request $request)
    {
        $data = $request->validate([
            'name'           => 'required|string|max:100',
            'uniqueId'       => 'required|string|max:100',
            'groupId'        => 'nullable|integer',
            'phone'          => 'nullable|string|max:30',
            'model'          => 'nullable|string|max:100',
            'contact'        => 'nullable|string|max:100',
            'category'       => 'nullable|string|max:50',
            'calendarId'     => 'nullable|integer',
            'expirationTime' => 'nullable|date',
            'disabled'       => 'nullable|boolean',
            'attributes'     => 'nullable|array',
        ]);

        // PHP can't distinguish an empty array from an empty object when re-encoding;
        // Traccar expects `attributes` to be a JSON object, never a JSON array.
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        // A restricted (non-super_admin) user can only ever create devices inside their own
        // client's group - silently force it rather than trusting a client-supplied groupId.
        $restrictedGroupId = $this->restrictedGroupId();
        if ($restrictedGroupId !== null) {
            $data['groupId'] = $restrictedGroupId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/devices", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateDevice(Request $request, int $id)
    {
        $this->assertDeviceAccessible($id);
        $data = $request->validate([
            'name'           => 'required|string|max:100',
            'groupId'        => 'nullable|integer',
            'phone'          => 'nullable|string|max:30',
            'model'          => 'nullable|string|max:100',
            'contact'        => 'nullable|string|max:100',
            'category'       => 'nullable|string|max:50',
            'calendarId'     => 'nullable|integer',
            'expirationTime' => 'nullable|date',
            'disabled'       => 'nullable|boolean',
        ]);

        // Same as storeDevice() - a restricted user can't move a device into another group.
        $restrictedGroupId = $this->restrictedGroupId();
        if ($restrictedGroupId !== null) {
            $data['groupId'] = $restrictedGroupId;
        }

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/devices", ['id' => $id]);
        $device = $existing->json()[0] ?? null;
        if (!$device) {
            return response()->json(['message' => 'Device not found.'], 404);
        }

        $merged = array_merge($device, $data);
        // Same empty-array/object ambiguity as storeDevice() - Traccar expects an object here.
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/devices/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function notifications()
    {
        return response()->json($this->scopedGroupList('notifications'));
    }

    public function drivers()
    {
        return response()->json($this->scopedGroupList('drivers'));
    }

    private function driverValidationRules(): array
    {
        return [
            'name'       => 'required|string|max:100',
            'uniqueId'   => 'required|string|max:100',
            'attributes' => 'nullable|array',
        ];
    }

    public function storeDriver(Request $request)
    {
        $data = $request->validate($this->driverValidationRules());
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/drivers", $data);
        if ($response->successful()) {
            $this->autoLinkToOwnGroup('driver', $response->json('id'));
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateDriver(Request $request, int $id)
    {
        $this->assertGroupResourceAccessible('drivers', $id);
        $data = $request->validate($this->driverValidationRules());

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/drivers/{$id}");
        $driver = $existing->json();
        if (!$driver) {
            return response()->json(['message' => 'Driver not found.'], 404);
        }

        $merged = array_merge($driver, $data);
        $merged['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/drivers/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyDriver(int $id)
    {
        $this->assertGroupResourceAccessible('drivers', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/drivers/{$id}");
        return response()->json(null, $response->status());
    }

    // Traccar's tc_device_{geofence,notification,driver} link tables are keyed deviceId-first;
    // the /permissions endpoint infers the table name from JSON key order, so deviceId must
    // be the first key in the request body for these to land in the right table.
    private const CONNECTION_KEYS = [
        'geofence'     => 'geofenceId',
        'notification' => 'notificationId',
        'driver'       => 'driverId',
        'attribute'    => 'attributeId',
        'maintenance'  => 'maintenanceId',
        'command'      => 'commandId',
    ];

    public function deviceConnections(int $id)
    {
        $this->assertDeviceAccessible($id);
        $fetch = fn (string $path) => Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/{$path}", ['deviceId' => $id])
            ->json();

        return response()->json([
            'geofences'          => $fetch('geofences'),
            'notifications'      => $fetch('notifications'),
            'drivers'            => $fetch('drivers'),
            'computedAttributes' => $fetch('attributes/computed'),
            'maintenances'       => $fetch('maintenance'),
            'commands'           => $fetch('commands'),
        ]);
    }

    public function linkDeviceConnection(Request $request, int $id)
    {
        $this->assertDeviceAccessible($id);
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/permissions", [
                'deviceId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function unlinkDeviceConnection(Request $request, int $id)
    {
        $this->assertDeviceAccessible($id);
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->delete("{$this->baseUrl}/permissions", [
                'deviceId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function notificationTypes()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/types");
        return response()->json($response->json(), $response->status());
    }

    public function notificators()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/notificators");
        return response()->json($response->json(), $response->status());
    }

    public function testNotificationChannels(Request $request)
    {
        $data = $request->validate([
            'channels'   => 'required|array|min:1',
            'channels.*' => 'string',
        ]);

        // Traccar's blanket POST /notifications/test ignores which channels the user picked -
        // it tests every notificator configured on the whole server in one loop, and if any one
        // of them throws (e.g. mail with no SMTP configured), the whole request fails even
        // though channels earlier in the loop (e.g. web) already sent successfully. Testing
        // each selected channel individually via /notifications/test/{notificator} avoids both
        // problems: only the chosen channels are exercised, and one failing channel doesn't
        // mask the others' results.
        $results = [];
        foreach ($data['channels'] as $channel) {
            $response = Http::withBasicAuth(...$this->auth)
                ->post("{$this->baseUrl}/notifications/test/{$channel}");
            $results[] = [
                'channel' => $channel,
                'success' => $response->successful(),
                'message' => $response->successful() ? null : ($response->json('message') ?? $response->body() ?? 'Failed to send.'),
            ];
        }

        return response()->json(['results' => $results]);
    }

    public function commands()
    {
        return response()->json($this->scopedGroupList('commands'));
    }

    public function commandTypes()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/commands/types");
        return response()->json($response->json(), $response->status());
    }

    private function savedCommandValidationRules(): array
    {
        return [
            'description'  => 'required|string|max:128',
            'type'         => 'required|string|max:128',
            'textChannel'  => 'nullable|boolean',
            'noQueue'      => 'nullable|boolean',
        ];
    }

    private function savedCommandPayload(array $data): array
    {
        $noQueue = $data['noQueue'] ?? false;
        unset($data['noQueue']);
        $data['deviceId'] = 0;
        $data['attributes'] = $noQueue ? ['noQueue' => true] : [];
        $data['attributes'] = (object) $data['attributes'];
        return $data;
    }

    public function storeSavedCommand(Request $request)
    {
        $data = $request->validate($this->savedCommandValidationRules());
        $payload = $this->savedCommandPayload($data);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/commands", $payload);
        if ($response->successful()) {
            $this->autoLinkToOwnGroup('command', $response->json('id'));
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateSavedCommand(Request $request, int $id)
    {
        $this->assertGroupResourceAccessible('commands', $id);
        $data = $request->validate($this->savedCommandValidationRules());
        $payload = $this->savedCommandPayload($data);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/commands/{$id}");
        $command = $existing->json();
        if (!$command) {
            return response()->json(['message' => 'Saved command not found.'], 404);
        }

        $merged = array_merge($command, $payload);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/commands/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroySavedCommand(int $id)
    {
        $this->assertGroupResourceAccessible('commands', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/commands/{$id}");
        return response()->json(null, $response->status());
    }

    public function computedAttributes()
    {
        return response()->json($this->scopedGroupList('attributes/computed'));
    }

    private function attributeValidationRules(): array
    {
        return [
            'description' => 'required|string|max:128',
            'attribute'   => 'required|string|max:128',
            'expression'  => 'required|string',
            'type'        => 'required|in:number,string,boolean',
            'priority'    => 'nullable|integer',
        ];
    }

    public function storeComputedAttribute(Request $request)
    {
        $data = $request->validate($this->attributeValidationRules());

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/attributes/computed", $data);
        if ($response->successful()) {
            $this->autoLinkToOwnGroup('attribute', $response->json('id'));
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateComputedAttribute(Request $request, int $id)
    {
        $this->assertGroupResourceAccessible('attributes/computed', $id);
        $data = $request->validate($this->attributeValidationRules());

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/attributes/computed/{$id}");
        $attribute = $existing->json();
        if (!$attribute) {
            return response()->json(['message' => 'Computed attribute not found.'], 404);
        }

        $merged = array_merge($attribute, $data);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/attributes/computed/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyComputedAttribute(int $id)
    {
        $this->assertGroupResourceAccessible('attributes/computed', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/attributes/computed/{$id}");
        return response()->json(null, $response->status());
    }

    public function testComputedAttribute(Request $request)
    {
        $data = $request->validate([
            'deviceId'    => 'required|integer',
            'description' => 'required|string|max:128',
            'attribute'   => 'required|string|max:128',
            'expression'  => 'required|string',
            'type'        => 'required|in:number,string,boolean',
            'priority'    => 'nullable|integer',
        ]);
        $deviceId = $data['deviceId'];
        $this->assertDeviceAccessible($deviceId);
        unset($data['deviceId']);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/attributes/computed/test?deviceId={$deviceId}", $data);

        if (!$response->successful()) {
            return response()->json(['message' => $response->body() ?: 'Test failed.'], $response->status());
        }
        return response()->json(['result' => $response->body()]);
    }

    public function maintenances()
    {
        return response()->json($this->scopedGroupList('maintenance'));
    }

    private function maintenanceValidationRules(): array
    {
        return [
            'name'   => 'required|string|max:128',
            'type'   => 'required|string|max:128',
            'start'  => 'required|numeric',
            'period' => 'required|numeric',
        ];
    }

    public function storeMaintenance(Request $request)
    {
        $data = $request->validate($this->maintenanceValidationRules());

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/maintenance", $data);
        if ($response->successful()) {
            $this->autoLinkToOwnGroup('maintenance', $response->json('id'));
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateMaintenance(Request $request, int $id)
    {
        $this->assertGroupResourceAccessible('maintenance', $id);
        $data = $request->validate($this->maintenanceValidationRules());

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/maintenance/{$id}");
        $maintenance = $existing->json();
        if (!$maintenance) {
            return response()->json(['message' => 'Maintenance not found.'], 404);
        }

        $merged = array_merge($maintenance, $data);
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/maintenance/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyMaintenance(int $id)
    {
        $this->assertGroupResourceAccessible('maintenance', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/maintenance/{$id}");
        return response()->json(null, $response->status());
    }

    public function notification(int $id)
    {
        $this->assertGroupResourceAccessible('notifications', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/{$id}");
        return response()->json($response->json(), $response->status());
    }

    private function notificationValidationRules(): array
    {
        return [
            'type'         => 'required|string|max:50',
            'always'       => 'nullable|boolean',
            'calendarId'   => 'nullable|integer',
            'commandId'    => 'nullable|integer',
            'notificators' => 'nullable|string|max:255',
            'description'  => 'nullable|string|max:255',
            // For type=alarm notifications, Traccar reads attributes.alarms as a comma-separated
            // list of alarm sub-types (e.g. "sos,fuelLeak") to filter which alarms trigger it.
            'attributes'   => 'nullable|array',
        ];
    }

    public function storeNotification(Request $request)
    {
        $data = $request->validate($this->notificationValidationRules());
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/notifications", $data);
        if ($response->successful()) {
            $this->autoLinkToOwnGroup('notification', $response->json('id'));
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateNotification(Request $request, int $id)
    {
        $this->assertGroupResourceAccessible('notifications', $id);
        $data = $request->validate($this->notificationValidationRules());

        // Unlike geofences, a path-based GET-by-id works fine for notifications, so we can
        // safely fetch-and-merge here. Traccar's PUT writes every column from the submitted
        // entity (it doesn't skip ones you omit), so a partial payload would null out the rest.
        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/{$id}");
        $notification = $existing->json();
        if (!$notification) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }

        $merged = array_merge($notification, $data);
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/notifications/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyNotification(int $id)
    {
        $this->assertGroupResourceAccessible('notifications', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/notifications/{$id}");
        return response()->json(null, $response->status());
    }

    // Traccar's Device resource has no `notificationId` filter, and the generic /permissions
    // GET is unreliable here (it infers the link table name from JSON key order, which doesn't
    // match the real deviceId-first tables for most pairs). So instead we derive the reverse
    // relation by asking each device for its own notifications (a filter that does work).
    public function notificationDevices(int $id)
    {
        $devices = $this->scopedDevices();
        if (empty($devices)) {
            return response()->json([]);
        }

        $responses = Http::pool(fn ($pool) => array_map(
            fn ($d) => $pool->as($d['id'])->withBasicAuth(...$this->auth)
                ->get("{$this->baseUrl}/notifications", ['deviceId' => $d['id']]),
            $devices
        ));

        $linked = array_values(array_filter($devices, function ($d) use ($responses, $id) {
            $notifs = $responses[$d['id']]->json() ?? [];
            return in_array($id, array_column($notifs, 'id'));
        }));

        return response()->json($linked);
    }

    public function groups()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/groups");
        $groups = $response->json() ?? [];
        $groupId = $this->restrictedGroupId();
        if ($groupId !== null) {
            $groups = array_values(array_filter($groups, fn ($g) => ($g['id'] ?? null) === $groupId));
        }
        return response()->json($groups, $response->status());
    }

    public function storeGroup(Request $request)
    {
        // Provisioning a client's one group is ClientProvisioningService's job - a restricted
        // user creating additional top-level groups would step outside their own tenant boundary.
        abort_if($this->restrictedGroupId() !== null, 403, 'Only super admins can create groups.');

        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'groupId'    => 'nullable|integer',
            'attributes' => 'nullable|array',
        ]);
        $data['groupId']    = $data['groupId'] ?? 0;
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/groups", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateGroup(Request $request, int $id)
    {
        $this->assertGroupAccessible($id);
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'groupId'    => 'nullable|integer',
            'attributes' => 'nullable|array',
        ]);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/groups/{$id}");
        $group = $existing->json();
        if (!$group) {
            return response()->json(['message' => 'Group not found.'], 404);
        }

        $merged = array_merge($group, $data);
        $merged['groupId']    = $data['groupId'] ?? 0;
        $merged['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/groups/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyGroup(int $id)
    {
        // Same reasoning as storeGroup() - a client's group is its tenant boundary, not theirs to delete.
        abort_if($this->restrictedGroupId() !== null, 403, 'Only super admins can delete groups.');
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/groups/{$id}");
        return response()->json(null, $response->status());
    }

    // Mirrors deviceConnections()/linkDeviceConnection()/unlinkDeviceConnection() but scoped to a
    // group instead of a device - groups have no "Devices" field of their own (a device points
    // at its group via deviceId.groupId, not the other way around), so only the 6 shared
    // connection types apply. tc_group_{geofence,notification,...} link tables are groupId-first,
    // same ordering requirement as the device-keyed tables.
    // Restricted users may only ever look at / change their own client's group connections -
    // every group is some other client's tenant boundary otherwise.
    private function assertGroupAccessible(int $groupId): void
    {
        $restrictedGroupId = $this->restrictedGroupId();
        abort_if($restrictedGroupId !== null && $groupId !== $restrictedGroupId, 403, 'You do not have access to this group.');
    }

    public function groupConnections(int $id)
    {
        $this->assertGroupAccessible($id);
        $fetch = fn (string $path) => Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/{$path}", ['groupId' => $id])
            ->json();

        return response()->json([
            'geofences'          => $fetch('geofences'),
            'notifications'      => $fetch('notifications'),
            'drivers'            => $fetch('drivers'),
            'computedAttributes' => $fetch('attributes/computed'),
            'maintenances'       => $fetch('maintenance'),
            'commands'           => $fetch('commands'),
        ]);
    }

    public function linkGroupConnection(Request $request, int $id)
    {
        $this->assertGroupAccessible($id);
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/permissions", [
                'groupId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function unlinkGroupConnection(Request $request, int $id)
    {
        $this->assertGroupAccessible($id);
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->delete("{$this->baseUrl}/permissions", [
                'groupId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    // Traccar has no group/device permission link for calendars - unlike geofences, notifications,
    // drivers, commands, and attributes, CalendarResource doesn't extend ExtendedObjectResource, so
    // there's no `groupId` query filter to lean on. Ownership is tracked locally instead, in
    // traccar_calendar_owners, recorded at creation time (see TraccarCalendarOwner).
    public function calendars()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/calendars");
        $calendars = $response->json() ?? [];

        if ($this->restrictedGroupId() === null) {
            return response()->json($calendars, $response->status());
        }

        $clientId = request()->user()?->client_id;
        $ownedIds = TraccarCalendarOwner::where('client_id', $clientId)->pluck('traccar_calendar_id')->all();
        $calendars = array_values(array_filter($calendars, fn ($c) => in_array($c['id'] ?? null, $ownedIds, true)));

        return response()->json($calendars, $response->status());
    }

    private function assertCalendarAccessible(int $calendarId): void
    {
        if ($this->restrictedGroupId() === null) {
            return;
        }
        $clientId = request()->user()?->client_id;
        $owned = TraccarCalendarOwner::where('traccar_calendar_id', $calendarId)->where('client_id', $clientId)->exists();
        abort_if(!$owned, 403, 'You do not have access to this calendar.');
    }

    public function storeCalendar(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'data' => 'required|string',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/calendars", $data);
        if ($response->successful()) {
            TraccarCalendarOwner::create([
                'traccar_calendar_id' => $response->json('id'),
                'client_id'           => request()->user()?->client_id,
            ]);
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateCalendar(Request $request, int $id)
    {
        $this->assertCalendarAccessible($id);
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'data' => 'required|string',
        ]);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/calendars/{$id}");
        $calendar = $existing->json();
        if (!$calendar) {
            return response()->json(['message' => 'Calendar not found.'], 404);
        }

        $merged = array_merge($calendar, $data);
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/calendars/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyCalendar(int $id)
    {
        $this->assertCalendarAccessible($id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/calendars/{$id}");
        if ($response->successful()) {
            TraccarCalendarOwner::where('traccar_calendar_id', $id)->delete();
        }
        return response()->json(null, $response->status());
    }

    public function latestPositions()
    {
        return response()->json($this->scopedPositions());
    }

    // Mints a short-lived Traccar bearer token for the browser to open Traccar's own websocket
    // (ws://.../api/socket?token=...) directly. This endpoint itself sits behind auth:sanctum
    // like every other /api/traccar/* route, so only an authenticated FleetTrack user can reach
    // it; the Traccar admin password is never sent to or seen by the browser, only this scoped,
    // time-limited, revocable token (Traccar defaults it to ~7 days, irrelevant here since the
    // frontend re-mints a fresh one on every (re)connect).
    public function wsToken()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->asForm()
            ->post("{$this->baseUrl}/session/token");

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to mint websocket token.'], $response->status());
        }

        $wsUrl = preg_replace('#^http#', 'ws', rtrim(config('services.traccar.url'), '/')) . '/api/socket';

        return response()->json([
            'token' => trim($response->body()),
            'url'   => $wsUrl,
        ]);
    }

    public function position(int $id)
    {
        $this->assertDeviceAccessible($id);
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/positions", ['deviceId' => $id]);
        return response()->json($response->json(), $response->status());
    }

    // Alert Details report: Traccar's GET /reports/events gives bare {deviceId, type, eventTime,
    // positionId, attributes} rows, so this joins in device/group (for Account) and the referenced
    // position (for speed/coordinates/address) to produce the flat rows the table renders.
    public function alertEvents(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
            'type'     => 'nullable|string',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }
        if ($request->filled('type')) {
            $params['type'] = $request->type;
        }

        $eventsResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/events", $params);

        if (!$eventsResponse->successful()) {
            return response()->json(['message' => 'Failed to load alert events.'], $eventsResponse->status());
        }
        $events = $this->filterRowsToScope($eventsResponse->json() ?? []);

        $devices    = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');
        $groups      = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/groups")->json() ?? [];
        $groupsById  = collect($groups)->keyBy('id');
        $drivers     = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/drivers")->json() ?? [];
        $driversByUniqueId = collect($drivers)->keyBy('uniqueId');

        $positionIds = array_values(array_unique(array_filter(array_column($events, 'positionId'))));
        $positionsById = [];
        if (!empty($positionIds)) {
            $posResponses = Http::pool(fn ($pool) => array_map(
                fn ($pid) => $pool->as($pid)->withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions", ['id' => $pid]),
                $positionIds
            ));
            foreach ($positionIds as $pid) {
                $pos = $posResponses[$pid]->json()[0] ?? null;
                if ($pos) {
                    $positionsById[$pid] = $pos;
                }
            }
        }

        $rows = array_map(function ($e) use ($devicesById, $groupsById, $positionsById, $driversByUniqueId) {
            $device       = $devicesById->get($e['deviceId'] ?? null);
            $group        = $device ? $groupsById->get($device['groupId'] ?? 0) : null;
            $pos          = $positionsById[$e['positionId'] ?? null] ?? null;
            $driverUnique = $pos['attributes']['driverUniqueId'] ?? null;
            $driver       = $driverUnique ? $driversByUniqueId->get($driverUnique) : null;

            return [
                'id'           => $e['id'],
                'deviceId'     => $e['deviceId'] ?? null,
                'deviceName'   => $device['name'] ?? null,
                'imei'         => $device['uniqueId'] ?? null,
                'model'        => $device['model'] ?? null,
                'account'      => $group['name'] ?? null,
                'type'         => $e['type'],
                'data'         => $e['attributes']['alarm'] ?? null,
                'driverName'   => $driver['name'] ?? null,
                'eventTime'    => $e['eventTime'],
                'positionTime' => $pos['fixTime'] ?? null,
                'speed'        => isset($pos['speed']) ? round($pos['speed'] * 1.852, 1) : null,
                'latitude'     => $pos['latitude'] ?? null,
                'longitude'    => $pos['longitude'] ?? null,
                'address'      => $pos['address'] ?? null,
            ];
        }, $events);

        usort($rows, fn ($a, $b) => strcmp($b['eventTime'], $a['eventTime']));

        return response()->json(array_values($rows));
    }

    // Internal Battery report: Traccar's GET /reports/route returns raw position history, with
    // attributes.batteryLevel present whenever the protocol reports it. Consecutive readings at the
    // same battery percentage are collapsed into one row spanning first-to-last reading at that
    // level (rather than printing every single ping), with Normal/Low/Critical derived from the level.
    public function internalBatteryReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load battery report.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $statusOf = function ($level) {
            if ($level < 20) return 'Critical';
            if ($level < 50) return 'Low';
            return 'Normal';
        };

        $byDevice = [];
        foreach ($positions as $p) {
            if (!array_key_exists('batteryLevel', $p['attributes'] ?? [])) {
                continue;
            }
            $byDevice[$p['deviceId']][] = $p;
        }

        $rows = [];
        foreach ($byDevice as $deviceId => $points) {
            usort($points, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
            $device  = $devicesById->get($deviceId);
            $segment = null;
            foreach ($points as $p) {
                $level  = $p['attributes']['batteryLevel'];
                $status = $statusOf($level);
                if ($segment && $segment['level'] === $level) {
                    $segment['endTime'] = $p['fixTime'];
                } else {
                    if ($segment) {
                        $rows[] = $segment;
                    }
                    $segment = [
                        'deviceId'   => $deviceId,
                        'deviceName' => $device['name'] ?? null,
                        'imei'       => $device['uniqueId'] ?? null,
                        'level'      => $level,
                        'status'     => $status,
                        'startTime'  => $p['fixTime'],
                        'endTime'    => $p['fixTime'],
                    ];
                }
            }
            if ($segment) {
                $rows[] = $segment;
            }
        }

        foreach ($rows as &$r) {
            $r['durationMinutes'] = round((strtotime($r['endTime']) - strtotime($r['startTime'])) / 60, 1);
            unset($r['endTime']);
        }
        unset($r);

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // External Battery report: same /reports/route history as the Internal Battery report, but
    // reads attributes.power (Traccar's KEY_POWER — the vehicle/external power-supply voltage seen
    // on the device's power input pin) falling back to attributes.battery, instead of batteryLevel
    // (the device's own internal backup battery percentage). One row per reading; devices/protocols
    // that never report this attribute simply contribute no rows.
    public function externalBatteryReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load external battery report.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($positions as $p) {
            $attrs   = $p['attributes'] ?? [];
            $voltage = $attrs['power'] ?? $attrs['battery'] ?? null;
            if ($voltage === null) {
                continue;
            }
            $device = $devicesById->get($p['deviceId']);
            $rows[] = [
                'deviceId'   => $p['deviceId'],
                'deviceName' => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'voltage'    => round($voltage, 2),
                'status'     => $voltage < 12.0 ? 'Low' : 'Normal',
                'recordTime' => $p['fixTime'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['recordTime'], $a['recordTime']));

        return response()->json(array_values($rows));
    }

    // Fuel Consumption report: Traccar's own /reports/summary "spentFuel" only populates when a
    // device is configured with its built-in fuel-consumption coefficient, which none of our
    // devices have — so this computes it ourselves from /reports/route history, three ways:
    //   none   - no sensor at all: distance x the device's configured average rate
    //            (attributes.fuelEfficiency, L/100km, defaults to 9.0 if unset)
    //   sensor - basic fuel-level sensor: sum of drops in attributes.fuel (refuels excluded),
    //            converted from % to liters via attributes.fuelCapacity when the readings look like a percentage
    //   obd    - OBD-II/CAN bus: attributes.fuelUsed (cumulative liters, last-first) falling back to
    //            integrating attributes.fuelConsumption (instantaneous L/h) over elapsed time
    // Devices with no data for the chosen method are simply omitted rather than shown as a misleading 0.
    public function fuelConsumptionReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
            'method'   => 'required|in:none,sensor,obd',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load fuel consumption report.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $byDevice = [];
        foreach ($positions as $p) {
            $byDevice[$p['deviceId']][] = $p;
        }

        $method = $request->method;
        $rows   = [];

        foreach ($byDevice as $deviceId => $points) {
            usort($points, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
            $device = $devicesById->get($deviceId);
            $usage  = $this->computeFuelUsage($points, $device, $method);
            if ($usage === null) {
                continue;
            }

            $rows[] = [
                'deviceId'       => $deviceId,
                'deviceName'     => $device['name'] ?? null,
                'imei'           => $device['uniqueId'] ?? null,
                'method'         => $method,
                'startTime'      => $points[0]['fixTime'],
                'endTime'        => end($points)['fixTime'],
                'distanceKm'     => round($usage['distanceKm'], 1),
                'fuelUsed'       => $usage['fuelUsed'],
                'avgConsumption' => $usage['distanceKm'] > 0 ? round($usage['fuelUsed'] / $usage['distanceKm'] * 100, 2) : null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // Shared by fuelConsumptionReport() and the Fuel Management ranking report - computes
    // distance/fuel-used for one device's chronologically-sorted /reports/route points, by whichever
    // of the three methods fuelConsumptionReport() supports. Returns null when the chosen method has
    // no usable data for this device (e.g. "sensor" requested but the device has no fuel attribute).
    private function computeFuelUsage(array $points, ?array $device, string $method): ?array
    {
        $first = $points[0];
        $last  = end($points);
        $distanceKm = max(0, (($last['attributes']['totalDistance'] ?? 0) - ($first['attributes']['totalDistance'] ?? 0)) / 1000);
        $fuelUsed   = null;

        if ($method === 'none') {
            $rate     = ($device['attributes'] ?? [])['fuelEfficiency'] ?? 9.0;
            $fuelUsed = round($distanceKm / 100 * $rate, 2);
        } elseif ($method === 'sensor') {
            $hasFuel  = false;
            $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;
            $drop = 0;
            $maxLevel = 0;
            $prevLevel = null;
            foreach ($points as $p) {
                if (!array_key_exists('fuel', $p['attributes'] ?? [])) {
                    continue;
                }
                $hasFuel = true;
                $level   = $p['attributes']['fuel'];
                $maxLevel = max($maxLevel, $level);
                if ($prevLevel !== null && $level < $prevLevel) {
                    $drop += $prevLevel - $level;
                }
                $prevLevel = $level;
            }
            if ($hasFuel) {
                $fuelUsed = ($capacity && $maxLevel <= 100) ? round($drop * $capacity / 100, 2) : round($drop, 2);
            }
        } else { // obd
            $usedReadings = array_values(array_filter($points, fn ($p) => array_key_exists('fuelUsed', $p['attributes'] ?? [])));
            if (!empty($usedReadings)) {
                $fuelUsed = round(end($usedReadings)['attributes']['fuelUsed'] - $usedReadings[0]['attributes']['fuelUsed'], 2);
            } else {
                $rateReadings = array_values(array_filter($points, fn ($p) => array_key_exists('fuelConsumption', $p['attributes'] ?? [])));
                if (count($rateReadings) > 1) {
                    $total = 0;
                    for ($i = 1; $i < count($rateReadings); $i++) {
                        $hours  = (strtotime($rateReadings[$i]['fixTime']) - strtotime($rateReadings[$i - 1]['fixTime'])) / 3600;
                        $total += $rateReadings[$i - 1]['attributes']['fuelConsumption'] * $hours;
                    }
                    $fuelUsed = round($total, 2);
                }
            }
        }

        if ($fuelUsed === null) {
            return null;
        }

        return ['distanceKm' => $distanceKm, 'fuelUsed' => $fuelUsed];
    }

    // Current Fuel Value report: a live snapshot from GET /api/positions (Traccar's latest-position-
    // per-device endpoint), reading each position's attributes.fuel sensor reading. Liters/percent are
    // cross-derived using the device's attributes.fuelCapacity when set; otherwise whichever the raw
    // value looks like (<=100 assumed %, >100 assumed liters) is reported and the other side is left
    // blank rather than guessed. Devices with no fuel sensor data simply show blank, not zero.
    public function currentFuel(Request $request)
    {
        $request->validate([
            'deviceId' => 'nullable|integer',
        ]);

        $positions = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions")->json() ?? [];
        $positionsByDeviceId = collect($positions)->keyBy('deviceId');

        $devices = $this->scopedDevices();
        if ($request->filled('deviceId')) {
            $devices = array_values(array_filter($devices, fn ($d) => $d['id'] == $request->deviceId));
        }

        $rows = [];
        foreach ($devices as $device) {
            $pos      = $positionsByDeviceId->get($device['id']);
            $attrs    = $pos['attributes'] ?? [];
            $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;

            $liters = null;
            $percent = null;
            if (array_key_exists('fuel', $attrs)) {
                $fuel = $attrs['fuel'];
                if ($capacity) {
                    if ($fuel <= 100) {
                        $percent = $fuel;
                        $liters  = round($fuel / 100 * $capacity, 1);
                    } else {
                        $liters  = $fuel;
                        $percent = round($fuel / $capacity * 100, 1);
                    }
                } elseif ($fuel <= 100) {
                    $percent = $fuel;
                } else {
                    $liters = $fuel;
                }
            }

            $rows[] = [
                'deviceId'    => $device['id'],
                'deviceName'  => $device['name'],
                'imei'        => $device['uniqueId'],
                'liters'      => $liters,
                'percent'     => $percent,
                'lastUpdated' => $pos['fixTime'] ?? $device['lastUpdate'] ?? null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($a['deviceName'] ?? '', $b['deviceName'] ?? ''));

        return response()->json(array_values($rows));
    }

    /* ── Fleet -> Fuel Management ───────────────────────────────────────────────────────────── */

    // Fuel Curve report: per-device chronological attributes.fuel readings from /reports/route, for
    // plotting a level-over-time curve - distinct from Fuel Consumption's single summary-per-device
    // total. Liters/percent are cross-derived via attributes.fuelCapacity, same convention as
    // currentFuel().
    public function fuelCurveReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load fuel curve.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($positions as $p) {
            if (!array_key_exists('fuel', $p['attributes'] ?? [])) {
                continue;
            }
            $device   = $devicesById->get($p['deviceId']);
            $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;
            $fuel     = $p['attributes']['fuel'];
            $isPct    = $fuel <= 100;

            $rows[] = [
                'deviceId'   => $p['deviceId'],
                'deviceName' => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'fixTime'    => $p['fixTime'],
                'percent'    => $isPct ? $fuel : ($capacity ? round($fuel / $capacity * 100, 1) : null),
                'liters'     => $isPct ? ($capacity ? round($fuel / 100 * $capacity, 1) : null) : $fuel,
                'latitude'   => $p['latitude'],
                'longitude'  => $p['longitude'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));

        return response()->json(array_values($rows));
    }

    private const REFUEL_THRESHOLD_PERCENT = 5.0;
    private const ABNORMAL_LOSS_THRESHOLD_PERCENT = 8.0;

    // Shared by refuellingReport() and abnormalFuelLossReport() - scans consecutive attributes.fuel
    // readings per device and classifies any jump as:
    //   Refuelling    - level rises by at least REFUEL_THRESHOLD_PERCENT
    //   Abnormal Loss - level falls by at least ABNORMAL_LOSS_THRESHOLD_PERCENT while the vehicle
    //                   barely moved (a normal trip burning that much fuel would also cover real
    //                   distance; a big drop with little/no distance points to a leak/siphon)
    // Both thresholds are percent-of-capacity so devices with different tank sizes share one scale.
    private function fuelLevelEvents(Request $request): array
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return [];
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $byDevice = [];
        foreach ($positions as $p) {
            if (array_key_exists('fuel', $p['attributes'] ?? [])) {
                $byDevice[$p['deviceId']][] = $p;
            }
        }

        $rows = [];
        foreach ($byDevice as $deviceId => $points) {
            usort($points, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
            $device   = $devicesById->get($deviceId);
            $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;

            for ($i = 1; $i < count($points); $i++) {
                $prev = $points[$i - 1];
                $cur  = $points[$i];
                $prevLevel = $prev['attributes']['fuel'];
                $curLevel  = $cur['attributes']['fuel'];
                $prevPct = ($capacity && $prevLevel > 100) ? ($prevLevel / $capacity * 100) : $prevLevel;
                $curPct  = ($capacity && $curLevel > 100)  ? ($curLevel / $capacity * 100)  : $curLevel;
                $delta   = $curPct - $prevPct;

                $distanceKm = max(0, (($cur['attributes']['totalDistance'] ?? 0) - ($prev['attributes']['totalDistance'] ?? 0)) / 1000);

                $type = null;
                if ($delta >= self::REFUEL_THRESHOLD_PERCENT) {
                    $type = 'Refuelling';
                } elseif (-$delta >= self::ABNORMAL_LOSS_THRESHOLD_PERCENT && $distanceKm < 1) {
                    $type = 'Abnormal Loss';
                }
                if (!$type) {
                    continue;
                }

                $rows[] = [
                    'deviceId'     => $deviceId,
                    'deviceName'   => $device['name'] ?? null,
                    'imei'         => $device['uniqueId'] ?? null,
                    'model'        => $device['model'] ?? null,
                    'type'         => $type,
                    'time'         => $cur['fixTime'],
                    'fromPercent'  => round($prevPct, 1),
                    'toPercent'    => round($curPct, 1),
                    'amountLiters' => $capacity ? round(abs($delta) * $capacity / 100, 2) : null,
                    'latitude'     => $cur['latitude'],
                    'longitude'    => $cur['longitude'],
                    'address'      => $cur['address'],
                ];
            }
        }

        usort($rows, fn ($a, $b) => strcmp($b['time'], $a['time']));

        return $rows;
    }

    public function refuellingReport(Request $request)
    {
        $rows = array_values(array_filter($this->fuelLevelEvents($request), fn ($r) => $r['type'] === 'Refuelling'));
        return response()->json($rows);
    }

    public function abnormalFuelLossReport(Request $request)
    {
        $rows = array_values(array_filter($this->fuelLevelEvents($request), fn ($r) => $r['type'] === 'Abnormal Loss'));
        return response()->json($rows);
    }

    // Idle Fuel report: fuel burned while idling (ignition on, not moving) - reuses
    // classifiedStops()'s existing Idling classification, then sums the attributes.fuel drop within
    // each idling window from a single /reports/route fetch (avoids one route call per stop).
    public function idleFuelReport(Request $request)
    {
        $idlingStops = array_values(array_filter($this->classifiedStops($request), fn ($r) => $r['state'] === 'Idling'));
        if (empty($idlingStops)) {
            return response()->json([]);
        }

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $routeResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);
        $positions = $this->filterRowsToScope($routeResponse->successful() ? ($routeResponse->json() ?? []) : []);

        $byDevice = [];
        foreach ($positions as $p) {
            $byDevice[$p['deviceId']][] = $p;
        }
        foreach ($byDevice as &$pts) {
            usort($pts, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
        }
        unset($pts);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($idlingStops as $stop) {
            $points = array_values(array_filter($byDevice[$stop['deviceId']] ?? [], fn ($p) =>
                $p['fixTime'] >= $stop['startTime'] && $p['fixTime'] <= $stop['endTime'] && array_key_exists('fuel', $p['attributes'] ?? [])
            ));
            if (count($points) < 2) {
                continue;
            }

            $device   = $devicesById->get($stop['deviceId']);
            $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;
            $dropPct  = max(0, $points[0]['attributes']['fuel'] - end($points)['attributes']['fuel']);
            if ($dropPct <= 0) {
                continue;
            }

            $rows[] = [
                'deviceId'       => $stop['deviceId'],
                'deviceName'     => $stop['deviceName'],
                'imei'           => $device['uniqueId'] ?? null,
                'model'          => $device['model'] ?? null,
                'startTime'      => $stop['startTime'],
                'endTime'        => $stop['endTime'],
                'idleDurationMs' => $stop['stayTimeMs'],
                'fuelUsed'       => $capacity ? round($dropPct * $capacity / 100, 2) : round($dropPct, 2),
                'latitude'       => $stop['latitude'],
                'longitude'      => $stop['longitude'],
                'address'        => $stop['address'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // Fuel Management ranking report: ranks by 'vehicle' (each device's overall L/100km for the
    // period via computeFuelUsage(), plus a tonne-km figure using the device's attributes.cargoTonnes
    // - same custom-attribute convention as fuelEfficiency/fuelCapacity/speedLimit, defaulting to 1
    // tonne when unset), 'route' (each individual trip's L/100km), or 'driver' (trips aggregated by
    // the driver reported on the position at trip start, via attributes.driverUniqueId - same lookup
    // as alertEvents()).
    public function fuelRankingReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
            'method'   => 'nullable|in:none,sensor,obd',
            'by'       => 'required|in:vehicle,driver,route',
        ]);

        $method = $request->method ?? 'none';
        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $routeResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);
        $positions = $this->filterRowsToScope($routeResponse->successful() ? ($routeResponse->json() ?? []) : []);
        $byDevice  = [];
        foreach ($positions as $p) {
            $byDevice[$p['deviceId']][] = $p;
        }
        foreach ($byDevice as &$pts) {
            usort($pts, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
        }
        unset($pts);

        if ($request->by === 'vehicle') {
            $rows = [];
            foreach ($byDevice as $deviceId => $points) {
                $device = $devicesById->get($deviceId);
                $usage  = $this->computeFuelUsage($points, $device, $method);
                if ($usage === null || $usage['distanceKm'] <= 0) {
                    continue;
                }
                $tonnes = ($device['attributes'] ?? [])['cargoTonnes'] ?? 1;
                $rows[] = [
                    'deviceId'       => $deviceId,
                    'deviceName'     => $device['name'] ?? null,
                    'imei'           => $device['uniqueId'] ?? null,
                    'model'          => $device['model'] ?? null,
                    'distanceKm'     => round($usage['distanceKm'], 1),
                    'fuelUsed'       => $usage['fuelUsed'],
                    'fuelPer100km'   => round($usage['fuelUsed'] / $usage['distanceKm'] * 100, 2),
                    'tonneKm'        => round($usage['distanceKm'] * $tonnes, 1),
                    'fuelPerTonneKm' => round($usage['fuelUsed'] / ($usage['distanceKm'] * $tonnes), 3),
                ];
            }
            usort($rows, fn ($a, $b) => $a['fuelPer100km'] <=> $b['fuelPer100km']);
            return response()->json(array_values($rows));
        }

        // 'route' and 'driver' both start from individual trips.
        $tripsResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/trips", $params);
        $trips = $this->filterRowsToScope($tripsResponse->successful() ? ($tripsResponse->json() ?? []) : []);

        $drivers           = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/drivers")->json() ?? [];
        $driversByUniqueId = collect($drivers)->keyBy('uniqueId');

        $tripRows = [];
        foreach ($trips as $trip) {
            $device     = $devicesById->get($trip['deviceId']);
            $rate       = ($device['attributes'] ?? [])['fuelEfficiency'] ?? 9.0;
            $distanceKm = $trip['distance'] / 1000;
            if ($distanceKm <= 0) {
                continue;
            }

            $driverName = null;
            foreach ($byDevice[$trip['deviceId']] ?? [] as $p) {
                if ($p['fixTime'] >= $trip['startTime'] && $p['fixTime'] <= $trip['endTime'] && !empty($p['attributes']['driverUniqueId'])) {
                    $driverName = $driversByUniqueId->get($p['attributes']['driverUniqueId'])['name'] ?? null;
                    break;
                }
            }

            $tripRows[] = [
                'deviceId'      => $trip['deviceId'],
                'deviceName'    => $trip['deviceName'] ?? $device['name'] ?? null,
                'driverName'    => $driverName,
                'startTime'     => $trip['startTime'],
                'startLocation' => $trip['startAddress'] ?? null,
                'endLocation'   => $trip['endAddress'] ?? null,
                'distanceKm'    => round($distanceKm, 1),
                'fuelUsed'      => round($distanceKm / 100 * $rate, 2),
                'fuelPer100km'  => round($rate, 1),
            ];
        }

        if ($request->by === 'route') {
            usort($tripRows, fn ($a, $b) => $a['fuelPer100km'] <=> $b['fuelPer100km']);
            return response()->json(array_values($tripRows));
        }

        // by === 'driver': aggregate trips per driver
        $byDriver = [];
        foreach ($tripRows as $row) {
            $key = $row['driverName'] ?? 'Unassigned';
            if (!isset($byDriver[$key])) {
                $byDriver[$key] = ['driverName' => $key, 'distanceKm' => 0, 'fuelUsed' => 0, 'trips' => 0];
            }
            $byDriver[$key]['distanceKm'] += $row['distanceKm'];
            $byDriver[$key]['fuelUsed']   += $row['fuelUsed'];
            $byDriver[$key]['trips']++;
        }
        $driverRows = array_values(array_map(function ($d) {
            $d['distanceKm']   = round($d['distanceKm'], 1);
            $d['fuelUsed']     = round($d['fuelUsed'], 2);
            $d['fuelPer100km'] = $d['distanceKm'] > 0 ? round($d['fuelUsed'] / $d['distanceKm'] * 100, 2) : null;
            return $d;
        }, $byDriver));
        usort($driverRows, fn ($a, $b) => ($a['fuelPer100km'] ?? PHP_FLOAT_MAX) <=> ($b['fuelPer100km'] ?? PHP_FLOAT_MAX));

        return response()->json($driverRows);
    }

    // Temperature & Humidity report: built from /reports/route, reading attributes.temp1 (Traccar's
    // first external temperature-probe channel) and attributes.humidity per reading. One row per
    // position that reports either value — readings without either are skipped.
    public function temperatureHumidityReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load temperature & humidity report.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($positions as $p) {
            $attrs    = $p['attributes'] ?? [];
            $temp     = $attrs['temp1'] ?? null;
            $humidity = $attrs['humidity'] ?? null;
            if ($temp === null && $humidity === null) {
                continue;
            }
            $device = $devicesById->get($p['deviceId']);
            $rows[] = [
                'deviceId'    => $p['deviceId'],
                'deviceName'  => $device['name'] ?? null,
                'imei'        => $device['uniqueId'] ?? null,
                'temperature' => $temp,
                'humidity'    => $humidity,
                'recordTime'  => $p['fixTime'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['recordTime'], $a['recordTime']));

        return response()->json(array_values($rows));
    }

    // Positioning & Battery report: built from /reports/route, combining attributes.rssi (raw
    // signal-quality value, unit varies by protocol), the position's own top-level accuracy field
    // (GPS accuracy in meters), and attributes.batteryLevel. One row per reading that reports at
    // least one of the three; readings with none are skipped.
    public function positioningBatteryReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load positioning & battery report.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($positions as $p) {
            $attrs   = $p['attributes'] ?? [];
            $signal   = $attrs['rssi'] ?? null;
            $accuracy = $p['accuracy'] ?? null;
            $battery  = $attrs['batteryLevel'] ?? null;
            if ($signal === null && !$accuracy && $battery === null) {
                continue;
            }
            $device = $devicesById->get($p['deviceId']);
            $rows[] = [
                'deviceId'   => $p['deviceId'],
                'deviceName' => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'signal'     => $signal,
                'accuracy'   => $accuracy,
                'battery'    => $battery,
                'recordTime' => $p['fixTime'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['recordTime'], $a['recordTime']));

        return response()->json(array_values($rows));
    }

    // Travel Statistics (OBD) report: built from Traccar's GET /reports/trips (motion-detected
    // trips — works for any device, not strictly OBD-only), grouped per device per calendar day.
    // Avg Speed is recomputed as distance/duration, and Max Speed is recomputed from the raw
    // /reports/route positions within each trip's time window, rather than trusting trips' own
    // averageSpeed/maxSpeed fields — both are unreliable (frequently come back as 0) once a query
    // spans more than a single day in this Traccar version, even when the underlying trip clearly moved.
    public function travelStatisticsReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/trips", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load travel statistics report.'], $response->status());
        }
        $trips = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $routeResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);
        $positionsByDevice = [];
        foreach ($this->filterRowsToScope($routeResponse->successful() ? ($routeResponse->json() ?? []) : []) as $p) {
            $positionsByDevice[$p['deviceId']][] = $p;
        }

        $groups = [];
        foreach ($trips as $trip) {
            $date = substr($trip['startTime'], 0, 10);
            $key  = $trip['deviceId'] . '|' . $date;
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'deviceId'    => $trip['deviceId'],
                    'date'        => $date,
                    'distanceKm'  => 0,
                    'durationMs'  => 0,
                    'maxSpeedKmh' => 0,
                    'trips'       => 0,
                ];
            }
            $tripMaxSpeedKnots = 0;
            foreach ($positionsByDevice[$trip['deviceId']] ?? [] as $p) {
                if ($p['fixTime'] >= $trip['startTime'] && $p['fixTime'] <= $trip['endTime']) {
                    $tripMaxSpeedKnots = max($tripMaxSpeedKnots, $p['speed'] ?? 0);
                }
            }

            $groups[$key]['distanceKm']  += $trip['distance'] / 1000;
            $groups[$key]['durationMs']  += $trip['duration'];
            $groups[$key]['maxSpeedKmh']  = max($groups[$key]['maxSpeedKmh'], $tripMaxSpeedKnots * 1.852);
            $groups[$key]['trips']++;
        }

        $rows = [];
        foreach ($groups as $g) {
            $device        = $devicesById->get($g['deviceId']);
            $durationHours = $g['durationMs'] / 3600000;
            $rows[] = [
                'deviceId'        => $g['deviceId'],
                'deviceName'      => $device['name'] ?? null,
                'imei'            => $device['uniqueId'] ?? null,
                'distanceKm'      => round($g['distanceKm'], 1),
                'durationMinutes' => round($g['durationMs'] / 60000),
                'avgSpeedKmh'     => $durationHours > 0 ? round($g['distanceKm'] / $durationHours, 1) : 0,
                'maxSpeedKmh'     => round($g['maxSpeedKmh'], 1),
                'trips'           => $g['trips'],
                'date'            => $g['date'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['date'], $a['date']) ?: strcmp($a['deviceName'] ?? '', $b['deviceName'] ?? ''));

        return response()->json(array_values($rows));
    }

    // Mileage report: built from Traccar's GET /reports/summary with daily=true, summed per device
    // across the day-rows ourselves. The non-daily (whole-range) summary call is unreliable across
    // multi-day spans in this Traccar version — its distance silently reflects only a sub-portion of
    // the range — whereas the daily-segmented rows are each correct, so we sum those instead.
    public function mileageReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from'  => Carbon::parse($request->from)->utc()->toISOString(),
            'to'    => Carbon::parse($request->to)->utc()->toISOString(),
            'daily' => 'true',
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/summary", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load mileage report.'], $response->status());
        }
        $summary = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $byDevice = [];
        foreach ($summary as $s) {
            $deviceId = $s['deviceId'];
            if (!isset($byDevice[$deviceId])) {
                $byDevice[$deviceId] = [
                    'deviceId'    => $deviceId,
                    'deviceName'  => $s['deviceName'] ?? null,
                    'distanceM'   => 0,
                    'startTime'   => $s['startTime'],
                    'endTime'     => $s['endTime'],
                ];
            }
            $byDevice[$deviceId]['distanceM'] += $s['distance'] ?? 0;
            $byDevice[$deviceId]['startTime']  = min($byDevice[$deviceId]['startTime'], $s['startTime']);
            $byDevice[$deviceId]['endTime']    = max($byDevice[$deviceId]['endTime'], $s['endTime']);
        }

        $rows = [];
        foreach ($byDevice as $d) {
            if (empty($d['distanceM'])) {
                continue;
            }
            $device = $devicesById->get($d['deviceId']);
            $rows[] = [
                'deviceId'   => $d['deviceId'],
                'deviceName' => $d['deviceName'] ?? $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'model'      => $device['model'] ?? null,
                'mileageKm'  => round($d['distanceM'] / 1000, 1),
                'startTime'  => $d['startTime'],
                'endTime'    => $d['endTime'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($a['deviceName'] ?? '', $b['deviceName'] ?? ''));

        return response()->json(array_values($rows));
    }

    // Trips report: built from Traccar's GET /reports/trips (start/end address, distance, duration),
    // with Average/Max Speed recomputed from the raw /reports/route positions inside each trip's time
    // window — trips' own averageSpeed/maxSpeed fields are unreliable once the query spans multiple
    // days (same issue fixed in travelStatisticsReport). Fuel figures reuse the device's configured
    // average-consumption rate (attributes.fuelEfficiency, defaults to 9.0 L/100km), the same "no
    // sensor" method as the Fuel Consumption report, which is why Fuel/100KM is constant per device.
    public function tripsReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/trips", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load trips report.'], $response->status());
        }
        $trips = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $routeResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);
        $positionsByDevice = [];
        foreach ($this->filterRowsToScope($routeResponse->successful() ? ($routeResponse->json() ?? []) : []) as $p) {
            $positionsByDevice[$p['deviceId']][] = $p;
        }

        $rows = [];
        foreach ($trips as $trip) {
            $device     = $devicesById->get($trip['deviceId']);
            $rate       = ($device['attributes'] ?? [])['fuelEfficiency'] ?? 9.0;
            $distanceKm = $trip['distance'] / 1000;

            $maxSpeedKnots = 0;
            foreach ($positionsByDevice[$trip['deviceId']] ?? [] as $p) {
                if ($p['fixTime'] >= $trip['startTime'] && $p['fixTime'] <= $trip['endTime']) {
                    $maxSpeedKnots = max($maxSpeedKnots, $p['speed'] ?? 0);
                }
            }
            $durationHours = $trip['duration'] / 3600000;
            $avgSpeedKmh   = $durationHours > 0 ? $distanceKm / $durationHours : 0;

            $rows[] = [
                'deviceId'      => $trip['deviceId'],
                'deviceName'    => $trip['deviceName'] ?? $device['name'] ?? null,
                'startTime'     => $trip['startTime'],
                'startLocation' => $trip['startAddress'] ?? null,
                'startLat'      => $trip['startLat'] ?? null,
                'startLon'      => $trip['startLon'] ?? null,
                'endTime'       => $trip['endTime'],
                'endLocation'   => $trip['endAddress'] ?? null,
                'endLat'        => $trip['endLat'] ?? null,
                'endLon'        => $trip['endLon'] ?? null,
                'durationMs'    => $trip['duration'],
                'mileageKm'     => round($distanceKm, 2),
                'fuelUsed'      => round($distanceKm / 100 * $rate, 2),
                'fuelPer100km'  => round($rate, 1),
                'avgSpeedKmh'   => round($avgSpeedKmh, 2),
                'maxSpeedKmh'   => round($maxSpeedKnots * 1.852, 1),
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // Overspeed report: Traccar's own deviceOverspeed event requires a server/device speed limit to
    // be configured (none is, on this server) and only fires as a single point-in-time event, with no
    // start/end period. So this scans /reports/route directly: positions above the limit (the
    // device's attributes.speedLimit in km/h, overridable per request, default 80) are grouped into
    // continuous runs, each becoming one overspeed period with its peak speed, start/end time and
    // location. Addresses fall back to coordinates when a position has no stored address (route
    // positions aren't retroactively geocoded the way /reports/trips start/end points are).
    public function overspeedReport(Request $request)
    {
        $request->validate([
            'from'       => 'required|date',
            'to'         => 'required|date|after:from',
            'deviceId'   => 'nullable|integer',
            'speedLimit' => 'nullable|numeric|min:1',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load overspeed report.'], $response->status());
        }
        $positions = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $byDevice = [];
        foreach ($positions as $p) {
            $byDevice[$p['deviceId']][] = $p;
        }

        $rows = [];
        foreach ($byDevice as $deviceId => $points) {
            usort($points, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
            $device   = $devicesById->get($deviceId);
            $limitKmh = $request->filled('speedLimit') ? (float) $request->speedLimit : (($device['attributes'] ?? [])['speedLimit'] ?? 80);

            $run = [];
            foreach ($points as $p) {
                $speedKmh = ($p['speed'] ?? 0) * 1.852;
                if ($speedKmh > $limitKmh) {
                    $run[] = ['p' => $p, 'speedKmh' => $speedKmh];
                } elseif (!empty($run)) {
                    $rows[] = $this->buildOverspeedRow($run, $device);
                    $run = [];
                }
            }
            if (!empty($run)) {
                $rows[] = $this->buildOverspeedRow($run, $device);
            }
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    private function buildOverspeedRow(array $run, ?array $device): array
    {
        $first    = $run[0]['p'];
        $last     = end($run)['p'];
        $maxSpeed = max(array_column($run, 'speedKmh'));

        return [
            'deviceId'      => $device['id'] ?? null,
            'deviceName'    => $device['name'] ?? null,
            'imei'          => $device['uniqueId'] ?? null,
            'model'         => $device['model'] ?? null,
            'speedKmh'      => round($maxSpeed, 2),
            'startTime'     => $first['fixTime'],
            'endTime'       => $last['fixTime'],
            'durationMs'    => (strtotime($last['fixTime']) - strtotime($first['fixTime'])) * 1000,
            'startLocation' => $first['address'] ?? null,
            'endLocation'   => $last['address'] ?? null,
            'startLat'      => $first['latitude'],
            'startLon'      => $first['longitude'],
            'endLat'        => $last['latitude'],
            'endLon'        => $last['longitude'],
        ];
    }

    // Parking/Idling reports: Traccar's GET /reports/stops gives every stationary period but doesn't
    // itself distinguish "parked" (engine off) from "idling" (engine running while stopped) — so this
    // looks up each stop's starting position (via its positionId) for attributes.ignition and
    // classifies accordingly. Shared by both report endpoints, which just filter to their own state.
    private function classifiedStops(Request $request): array
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/stops", $params);

        if (!$response->successful()) {
            return [];
        }
        $stops = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');
        $groups      = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/groups")->json() ?? [];
        $groupsById  = collect($groups)->keyBy('id');

        $positionIds = array_values(array_unique(array_filter(array_column($stops, 'positionId'))));
        $positionsById = [];
        if (!empty($positionIds)) {
            $posResponses = Http::pool(fn ($pool) => array_map(
                fn ($pid) => $pool->as($pid)->withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions", ['id' => $pid]),
                $positionIds
            ));
            foreach ($positionIds as $pid) {
                $pos = $posResponses[$pid]->json()[0] ?? null;
                if ($pos) {
                    $positionsById[$pid] = $pos;
                }
            }
        }

        $rows = [];
        foreach ($stops as $s) {
            $pos      = $positionsById[$s['positionId'] ?? null] ?? null;
            $ignition = $pos['attributes']['ignition'] ?? null;
            $device   = $devicesById->get($s['deviceId']);
            $group    = $device ? $groupsById->get($device['groupId'] ?? 0) : null;

            $rows[] = [
                'deviceId'   => $s['deviceId'],
                'deviceName' => $s['deviceName'] ?? $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'model'      => $device['model'] ?? null,
                'account'    => $group['name'] ?? null,
                'state'      => $ignition === true ? 'Idling' : 'Parking',
                'startTime'  => $s['startTime'],
                'endTime'    => $s['endTime'],
                'latitude'   => $s['latitude'],
                'longitude'  => $s['longitude'],
                'address'    => $s['address'],
                'stayTimeMs' => $s['duration'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return $rows;
    }

    public function parkingReport(Request $request)
    {
        $rows = array_values(array_filter($this->classifiedStops($request), fn ($r) => $r['state'] === 'Parking'));
        return response()->json($rows);
    }

    public function idlingReport(Request $request)
    {
        $rows = array_values(array_filter($this->classifiedStops($request), fn ($r) => $r['state'] === 'Idling'));
        return response()->json($rows);
    }

    // Ignition report: Traccar's ignitionOn/ignitionOff events are single point-in-time markers, not
    // periods — so this pairs up consecutive events per device into ON/OFF periods (state from the
    // earlier event, ending when the next ignition event fires, or at the query's "to" bound if it's
    // the last event in range). Coordinates/Address are intentionally left blank to match the
    // reference UI — ignition state changes aren't shown with a location here.
    public function ignitionReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $to = Carbon::parse($request->to)->utc();
        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => $to->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }
        // Traccar's @QueryParam List<String> "type" needs repeated plain "type=a&type=b" — Laravel's
        // Http client would otherwise encode an array value as "type[0]=a&type[1]=b", which Jersey
        // silently fails to bind, making the filter a no-op (returns every event type instead).
        $query = http_build_query($params) . '&type=ignitionOn&type=ignitionOff';

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/events?{$query}");

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load ignition report.'], $response->status());
        }
        $events = $this->filterRowsToScope($response->json() ?? []);

        $devices     = $this->scopedDevices();
        $devicesById = collect($devices)->keyBy('id');

        $byDevice = [];
        foreach ($events as $e) {
            $byDevice[$e['deviceId']][] = $e;
        }

        $rows = [];
        foreach ($byDevice as $deviceId => $deviceEvents) {
            usort($deviceEvents, fn ($a, $b) => strcmp($a['eventTime'], $b['eventTime']));
            $device = $devicesById->get($deviceId);

            foreach ($deviceEvents as $i => $event) {
                $next    = $deviceEvents[$i + 1] ?? null;
                $endTime = $next ? $next['eventTime'] : $to->toISOString();

                $rows[] = [
                    'deviceId'    => $deviceId,
                    'deviceName'  => $device['name'] ?? null,
                    'imei'        => $device['uniqueId'] ?? null,
                    'model'       => $device['model'] ?? null,
                    'state'       => $event['type'] === 'ignitionOn' ? 'ON' : 'OFF',
                    'startTime'   => $event['eventTime'],
                    'endTime'     => $endTime,
                    'totalTimeMs' => max(0, (strtotime($endTime) - strtotime($event['eventTime'])) * 1000),
                ];
            }
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // Geo Fence report: pairs Traccar's geofenceEnter/geofenceExit events (GET /api/reports/events)
    // per device+geofence into enter/exit periods with a stay duration, the same point-in-time-event
    // pairing technique used for the Ignition report. A dangling enter with no matching exit yet is
    // treated as still inside as of the query's "to" bound.
    public function geofenceReport(Request $request)
    {
        $request->validate([
            'from'       => 'required|date',
            'to'         => 'required|date|after:from',
            'deviceId'   => 'nullable|integer',
            'geofenceId' => 'nullable|integer',
        ]);

        $to = Carbon::parse($request->to)->utc();
        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => $to->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }
        // Same repeated-plain-key requirement as ignitionReport() — see the comment there.
        $query = http_build_query($params) . '&type=geofenceEnter&type=geofenceExit';

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/events?{$query}");

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load geofence report.'], $response->status());
        }
        $events = $this->filterRowsToScope($response->json() ?? []);

        $devices       = $this->scopedDevices();
        $devicesById   = collect($devices)->keyBy('id');
        $geofences     = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/geofences")->json() ?? [];
        $geofencesById = collect($geofences)->keyBy('id');

        $byKey = [];
        foreach ($events as $e) {
            if ($request->filled('geofenceId') && (int) $e['geofenceId'] !== (int) $request->geofenceId) {
                continue;
            }
            $byKey[$e['deviceId'] . '|' . $e['geofenceId']][] = $e;
        }

        $rows = [];
        foreach ($byKey as $key => $keyEvents) {
            usort($keyEvents, fn ($a, $b) => strcmp($a['eventTime'], $b['eventTime']));
            [$deviceId, $geofenceId] = array_map('intval', explode('|', $key));
            $device   = $devicesById->get($deviceId);
            $geofence = $geofencesById->get($geofenceId);

            $enterEvent = null;
            foreach ($keyEvents as $event) {
                if ($event['type'] === 'geofenceEnter') {
                    $enterEvent = $event;
                } elseif ($event['type'] === 'geofenceExit' && $enterEvent) {
                    $rows[] = [
                        'deviceId'   => $deviceId,
                        'deviceName' => $device['name'] ?? null,
                        'imei'       => $device['uniqueId'] ?? null,
                        'model'      => $device['model'] ?? null,
                        'fenceName'  => $geofence['name'] ?? null,
                        'enterTime'  => $enterEvent['eventTime'],
                        'exitTime'   => $event['eventTime'],
                        'stayTimeMs' => max(0, (strtotime($event['eventTime']) - strtotime($enterEvent['eventTime'])) * 1000),
                    ];
                    $enterEvent = null;
                }
            }
            if ($enterEvent) {
                $rows[] = [
                    'deviceId'   => $deviceId,
                    'deviceName' => $device['name'] ?? null,
                    'imei'       => $device['uniqueId'] ?? null,
                    'model'      => $device['model'] ?? null,
                    'fenceName'  => $geofence['name'] ?? null,
                    'enterTime'  => $enterEvent['eventTime'],
                    'exitTime'   => $to->toISOString(),
                    'stayTimeMs' => max(0, (strtotime($to->toISOString()) - strtotime($enterEvent['eventTime'])) * 1000),
                ];
            }
        }

        usort($rows, fn ($a, $b) => strcmp($b['enterTime'], $a['enterTime']));

        return response()->json(array_values($rows));
    }

    // Online/Offline reports: current device connectivity state, not a date-range report. Joins
    // /devices (status, lastUpdate, phone, model) with each device's latest /positions row
    // (coordinates/address). "SIM" has no native Traccar device field, so it follows the same
    // custom-attribute convention used elsewhere this session (fuelEfficiency, speedLimit, etc.) —
    // read from attributes.sim, blank if the device has none set.
    private function deviceStatusRows(bool $online): array
    {
        $devices   = $this->scopedDevices();
        $positions = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions")->json() ?? [];
        $positionsByDeviceId = collect($positions)->keyBy('deviceId');

        $rows = [];
        foreach ($devices as $d) {
            // Traccar has a third "unknown" status (e.g. never reported in, disabled) besides
            // online/offline. The reference UI only has two buckets, so anything not online is
            // treated as offline rather than silently disappearing from both reports.
            $isOnline = ($d['status'] ?? 'unknown') === 'online';
            if ($isOnline !== $online) {
                continue;
            }
            $pos = $positionsByDeviceId->get($d['id']);

            $rows[] = [
                'deviceId'   => $d['id'],
                'deviceName' => $d['name'] ?? null,
                'imei'       => $d['uniqueId'] ?? null,
                'model'      => $d['model'] ?? null,
                'sim'        => $d['attributes']['sim'] ?? null,
                'phone'      => $d['phone'] ?? null,
                'lastUpdate' => $d['lastUpdate'] ?? null,
                'latitude'   => $pos['latitude'] ?? null,
                'longitude'  => $pos['longitude'] ?? null,
                'address'    => $pos['address'] ?? null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($a['deviceName'] ?? '', $b['deviceName'] ?? ''));

        return $rows;
    }

    public function onlineDevicesReport()
    {
        return response()->json($this->deviceStatusRows(true));
    }

    public function offlineDevicesReport()
    {
        return response()->json($this->deviceStatusRows(false));
    }

    public function routeHistory(Request $request, int $id)
    {
        $this->assertDeviceAccessible($id);
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", [
                'deviceId' => $id,
                'from'     => Carbon::parse($request->from)->utc()->toISOString(),
                'to'       => Carbon::parse($request->to)->utc()->toISOString(),
            ]);
        return response()->json($response->json(), $response->status());
    }

    public function trips(Request $request, int $id)
    {
        $this->assertDeviceAccessible($id);
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/trips", [
                'deviceId' => $id,
                'from'     => Carbon::parse($request->from)->utc()->toISOString(),
                'to'       => Carbon::parse($request->to)->utc()->toISOString(),
            ]);
        return response()->json($response->json(), $response->status());
    }

    public function exportTrips(Request $request, int $id)
    {
        $this->assertDeviceAccessible($id);
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => $xlsxType])
            ->get("{$this->baseUrl}/reports/trips", [
                'deviceId' => $id,
                'from'     => Carbon::parse($request->from)->utc()->toISOString(),
                'to'       => Carbon::parse($request->to)->utc()->toISOString(),
            ]);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to export trips report.'], $response->status());
        }

        return response($response->body(), 200)
            ->header('Content-Type', $xlsxType)
            ->header('Content-Disposition', 'attachment; filename="trips.xlsx"');
    }

    public function geofences()
    {
        return response()->json($this->scopedGroupList('geofences'));
    }

    public function storeGeofence(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'area'        => 'required|string',
            'description' => 'nullable|string|max:255',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/geofences", $data);
        if ($response->successful()) {
            $this->autoLinkToOwnGroup('geofence', $response->json('id'));
        }
        return response()->json($response->json(), $response->status());
    }

    public function updateGeofence(Request $request, int $id)
    {
        $this->assertGroupResourceAccessible('geofences', $id);
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'area'        => 'required|string',
            'description' => 'nullable|string|max:255',
        ]);

        // Traccar's geofences endpoint doesn't filter GET by `id` (unlike devices), so there's
        // no safe way to fetch-and-merge the existing record here. It does, however, key the
        // update off the `id` in the body (not the URL), and accepts a partial payload fine.
        $data['id'] = $id;

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/geofences/{$id}", $data);
        return response()->json($response->json(), $response->status());
    }

    public function destroyGeofence(int $id)
    {
        $this->assertGroupResourceAccessible('geofences', $id);
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/geofences/{$id}");
        return response()->json(null, $response->status());
    }
}
