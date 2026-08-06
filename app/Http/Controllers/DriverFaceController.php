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

        // code=1000 here only confirms TurboHive queued the SHOT command — it says nothing about
        // whether the device actually captured a usable face. The real result ("SHOT OK!"/"SHOT
        // FAIL!...") arrives later on {userId}/notify/# and is matched back to this row by cmd_no
        // (see MqttWorker::recordFaceShotResult()), which then flips status to enrolled/failed.
        $face = DriverFace::updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $data['imei']],
            [
                'status'       => $ok ? 'pending' : 'failed',
                'cmd_no'       => $ok ? ($result['data']['cmdNo'] ?? $result['data']['cmd_no'] ?? null) : null,
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

    /**
     * Stores a browser-captured (office/laptop webcam) photo locally — no TurboHive API call here;
     * this is purely local capture/prep, feeding the driver into the "Face Photos" batch-select
     * list (downloadFaceBatch()) which is what actually pushes photos to a device via EVENTSET,
     * FACE,DOWN. Previously this posted straight to TurboHive's own face-image ingest API and
     * stored the photo on the 'public' Storage disk — moved off that disk because this project's
     * public/storage symlink (`php artisan storage:link`) was never created, so every /storage/...
     * URL 404'd (broken thumbnails). Stored directly under public/img/uploads instead — the exact
     * same directory face/uploadPic and downloadFaceBatch() already use, reachable straight off the
     * docroot with no symlink involved.
     */
    public function captureFromCamera(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'required|string',
            'photo'     => 'required|image|max:184320', // 180 MB, per face-upload-api.md
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $photo  = $request->file('photo');

        // "<badge_no>-<name>.<ext>" — same convention the device itself uses (EVENTSET,FACE,SHOT/
        // GET) and that FaceUploadService::resolveDriver() parses back on the receiving end.
        // Deterministic + overwritten on every re-capture, rather than accumulating stale copies.
        $extension = $photo->getClientOriginalExtension() ?: 'jpg';
        $fileName  = "{$driver->badge_no}-{$this->faceToken($driver->name)}.{$extension}";

        $uploadDir = public_path('img/uploads');
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        $photo->move($uploadDir, $fileName);

        $face = DriverFace::updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $data['imei']],
            [
                'photo_path'   => "img/uploads/{$fileName}",
                'status'       => 'pending',
                'error'        => null,
                'requested_at' => now(),
            ]
        );

        return response()->json(['face' => $face->fresh('driver')]);
    }

    /**
     * Raw test of TurboHive's face-image ingest API (POST /face/uploadPic — see
     * face-upload-api.md) with no actual photo — just a file name (e.g. "22222-Jerome") sent as
     * the multipart "file" field's filename with empty content. Lets us verify the signature/host
     * and see TurboHive's real response (code 200/400/403/500) without needing a real image.
     * Nothing is stored locally and no DriverFace record is touched — this is a pass-through.
     */
    public function testUploadToTurboHive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'      => 'required|string',
            'file_name' => 'required|string|max:255',
        ]);

        return response()->json($this->turboHive->uploadFacePhoto($data['imei'], $data['file_name']));
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

    /**
     * Asks the device to re-send the driver's currently-stored face photo (EVENTSET,FACE,GET) —
     * doesn't re-capture anything, just re-uploads what's already enrolled on-device. Useful for
     * pulling a photo into FleetTrack for a driver enrolled before this app pointed the device's
     * UPLOADFACE target at our own /img/uploads/face/uploadPic. The photo itself arrives
     * asynchronously there and gets linked back automatically (see FaceUploadService::linkToDriver).
     */
    public function fetchPhoto(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'required|string',
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $entry  = "{$driver->badge_no}-{$this->faceToken($driver->name)}";
        $result = $this->turboHive->fetchDriverFace($data['imei'], $entry);

        return response()->json($result);
    }

    /**
     * "Download Face Photos to Device" (Face_Photo_Upload_Download_Integration_Guide.md §2) — zips
     * up to 5 already-captured driver photos (from DriverFace.photo_path — either device SHOT/GET
     * captures under public/img/uploads or laptop-camera captures under the 'public' Storage disk),
     * each renamed to the "<badge_no>-<name>.jpg" convention the guide requires inside the zip,
     * saves the zip to the same public/img/uploads directory face/uploadPic itself writes to, and
     * sends EVENTSET,FACE,DOWN with that zip's URL. The guide is explicit that a non-zip URL fails
     * format validation immediately — this is why uploadFromCamera()'s single-image FACE,DOWN call
     * was never reliable (see its docblock); this replaces that as the real, guide-compliant path.
     *
     * There's no automatic per-driver confirmation for a DOWN batch (unlike SHOT's notify/# result)
     * — the guide's own verification step is EVENTSET,FACE,CHECK# to confirm the device's face
     * count went up by the expected amount. DriverFace rows for the selected drivers are left
     * untouched here rather than optimistically marked enrolled.
     */
    public function downloadFaceBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'          => 'required|string',
            'driver_ids'    => 'required|array|min:1|max:5',
            'driver_ids.*'  => 'integer|exists:drivers,id',
        ]);

        if (!class_exists(\ZipArchive::class)) {
            return response()->json(['message' => 'The PHP zip extension is not available on this server.'], 500);
        }

        $entries = [];
        foreach ($data['driver_ids'] as $driverId) {
            $driver = Driver::find($driverId);
            $face = DriverFace::where('driver_id', $driverId)->whereNotNull('photo_path')->orderByDesc('updated_at')->first();
            if (!$driver || !$face) {
                continue;
            }

            $diskPath = $this->photoDiskPath($face->photo_path);
            if (!$diskPath || !is_file($diskPath)) {
                continue;
            }

            $entries[] = ['driver' => $driver, 'disk_path' => $diskPath];
        }

        if (empty($entries)) {
            return response()->json(['message' => 'None of the selected drivers have a usable photo on file.'], 422);
        }

        $uploadDir = public_path('img/uploads');
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $zipName = 'face-batch-' . now()->format('YmdHis') . '-' . substr(uniqid(), -6) . '.zip';
        $zipPath = $uploadDir . DIRECTORY_SEPARATOR . $zipName;

        $zip = new \ZipArchive();
        if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return response()->json(['message' => 'Failed to create zip archive.'], 500);
        }

        $names = [];
        foreach ($entries as $entry) {
            $extension = pathinfo($entry['disk_path'], PATHINFO_EXTENSION) ?: 'jpg';
            $fileName  = "{$entry['driver']->badge_no}-{$this->faceToken($entry['driver']->name)}.{$extension}";
            $zip->addFile($entry['disk_path'], $fileName);
            $names[] = $entry['driver']->name;
        }
        $zip->close();

        $url    = $request->getSchemeAndHttpHost() . '/img/uploads/' . $zipName;
        $result = $this->turboHive->importFaceBatch($data['imei'], $url);

        return response()->json([
            'command' => $result,
            'zip_url' => $url,
            'drivers' => $names,
        ]);
    }

    /** Physical path for a stored DriverFace photo — see facePhotoUrl() on the frontend for the
     *  matching URL-side logic; both branches exist for the same reason (two different storage
     *  locations depending on capture source — see uploadPic vs uploadToTurboHive/upload()). */
    private function photoDiskPath(string $photoPath): ?string
    {
        if (str_starts_with($photoPath, 'img/uploads/')) {
            return public_path($photoPath);
        }

        return Storage::disk('public')->path($photoPath);
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
