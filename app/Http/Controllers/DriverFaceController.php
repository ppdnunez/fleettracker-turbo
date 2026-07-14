<?php

namespace App\Http\Controllers;

use App\Models\Driver;
use App\Models\DriverFace;
use App\Services\TurboHiveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

// Face enrollment happens on the JC171 device itself (EVENTSET,FACE,* commands, sent via
// TurboHive's POST /v3/command/send — see TurboHiveService's Face Recognition section). This
// controller tracks what we've asked each device to do locally and receives the captured photo
// back on our own webhook (device is pointed at it once via setUploadUrl() / UPLOADFACE).
class DriverFaceController extends Controller
{
    public function __construct(protected TurboHiveService $turboHive)
    {
    }

    // ── Enrollment state (local tracking) ────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = DriverFace::with('driver')->orderByDesc('updated_at');

        if ($imei = $request->query('imei')) {
            $query->where('imei', $imei);
        }
        if ($driverId = $request->query('driver_id')) {
            $query->where('driver_id', $driverId);
        }

        return response()->json($query->get());
    }

    // ── Device commands ───────────────────────────────────────────────────────

    public function configure(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'            => 'required|string',
            'similarity'      => 'required',
            'deadlineSeconds' => 'nullable|integer|min:1',
            'recheckMinutes'  => 'nullable|integer|min:1',
        ]);

        $similarity = strtoupper((string) $data['similarity']) === 'OFF' ? 'OFF' : (int) $data['similarity'];

        return response()->json($this->turboHive->configureFaceRecognition(
            $data['imei'],
            $similarity,
            (int) ($data['deadlineSeconds'] ?? 180),
            (int) ($data['recheckMinutes'] ?? 10),
        ));
    }

    public function enroll(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'required|string',
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $result = $this->turboHive->enrollDriverFace($data['imei'], $driver->badge_no, $this->faceToken($driver->name));
        $ok     = (int) ($result['code'] ?? 0) === 1000;

        $face = DriverFace::updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $data['imei']],
            [
                'status'       => $ok ? 'pending' : 'failed',
                'requested_at' => now(),
                'error'        => $ok ? null : ($result['message'] ?? 'Command failed.'),
            ]
        );

        return response()->json(['command' => $result, 'face' => $face->fresh('driver')]);
    }

    /**
     * Alternative to enroll() for a driver photographed with a laptop/office webcam instead of the
     * JC171's own camera (e.g. onboarding before the driver is ever near the vehicle). The photo is
     * stored on our own server first, then pushed to the device via EVENTSET,FACE,DOWN (bulk-import
     * from a cloud URL) rather than SHOT, since there's no device-side capture to trigger here.
     *
     * NOTE: the JC171 guide's only documented FACE,DOWN example points at a .zip of multiple named
     * photos ("max 5 photos per send, each under 200 KB") — it's unconfirmed whether pointing it at
     * a single plain image URL (as done here) is accepted the same way, or whether it strictly
     * requires a zip. Verify against a real device; if it turns out to require a zip, this would
     * need to wrap the stored photo in one before sending.
     */
    public function uploadFromCamera(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'required|string',
            'photo'     => 'required|image|max:5120',
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $path   = $request->file('photo')->store('driver-faces', 'public');
        $url    = $request->getSchemeAndHttpHost() . Storage::disk('public')->url($path);

        $result = $this->turboHive->importFaceBatch($data['imei'], $url);
        $ok     = (int) ($result['code'] ?? 0) === 1000;

        $face = DriverFace::updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $data['imei']],
            [
                'photo_path'   => $path,
                'status'       => $ok ? 'pending' : 'failed',
                'error'        => $ok ? null : ($result['message'] ?? 'Failed to push photo to device.'),
                'requested_at' => now(),
            ]
        );

        return response()->json(['command' => $result, 'face' => $face->fresh('driver')]);
    }

    public function test(Request $request): JsonResponse
    {
        $data = $request->validate(['imei' => 'required|string']);
        return response()->json($this->turboHive->testFaceRecognition($data['imei']));
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'required|string',
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $entry  = "{$driver->badge_no}-{$this->faceToken($driver->name)}";
        $result = $this->turboHive->deleteDriverFace($data['imei'], [$entry]);

        DriverFace::where(['driver_id' => $driver->id, 'imei' => $data['imei']])->update(['status' => 'deleted']);

        return response()->json($result);
    }

    public function roster(Request $request): JsonResponse
    {
        $data = $request->validate(['imei' => 'required|string']);
        return response()->json($this->turboHive->checkFaceRoster($data['imei']));
    }

    public function setUploadUrl(Request $request): JsonResponse
    {
        $data = $request->validate(['imei' => 'required|string', 'url' => 'required|url']);
        return response()->json($this->turboHive->setFaceUploadUrl($data['imei'], $data['url']));
    }

    // ── Upload webhook ────────────────────────────────────────────────────────

    /**
     * Public route (no auth:sanctum — the device can't hold a user session), guarded instead by a
     * shared-secret path token (config('services.turbohive.face_upload_token')). Point the device
     * here via setUploadUrl()/UPLOADFACE.
     *
     * NOTE: the exact payload shape JC171 posts (multipart field name, whether imei/driverId
     * arrive as query params vs. form fields) isn't pinned down by the vendor docs on hand — this
     * accepts the common conventions (query params + "file"/"photo" form field) and should be
     * re-verified against a real capture once a device is on-site.
     */
    public function upload(Request $request, string $token): JsonResponse
    {
        if (!hash_equals((string) config('services.turbohive.face_upload_token'), $token)) {
            abort(404);
        }

        $imei     = $request->query('imei', $request->input('imei'));
        $driverId = $request->query('driverId', $request->input('driverId'));
        $file     = $request->file('file') ?? $request->file('photo');

        if (!$imei || !$file) {
            return response()->json(['message' => 'Missing imei or file.'], 422);
        }

        $path = $file->store('driver-faces', 'public');

        $face = null;
        if ($driverId && $driver = Driver::where('badge_no', $driverId)->first()) {
            $face = DriverFace::updateOrCreate(
                ['driver_id' => $driver->id, 'imei' => $imei],
                ['status' => 'enrolled', 'photo_path' => $path, 'enrolled_at' => now(), 'error' => null]
            );
        }

        return response()->json(['stored' => $path, 'face' => $face]);
    }

    private function faceToken(string $value): string
    {
        $clean = preg_replace('/[^A-Za-z0-9_]+/', '', str_replace(' ', '_', trim($value)));
        return $clean !== '' ? $clean : 'driver';
    }
}
