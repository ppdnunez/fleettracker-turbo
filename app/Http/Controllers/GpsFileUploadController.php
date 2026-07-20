<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

// HTTP replacement for the FTPGPS IIS FTP site (C:\FTPGPS, port 21): that device's firmware also
// supports an HTTP upload mode, which sidesteps FTP passive-mode's multi-port requirement entirely
// (a single HTTP port tunnels cleanly through ngrok's free tier, unlike FTP's 5000-5100 data-port
// range). Public route (no auth:sanctum — the device can't hold a user session), guarded instead
// by a shared-secret path token, same pattern as DriverFaceController::upload.
class GpsFileUploadController extends Controller
{
    public function upload(Request $request, string $token): JsonResponse
    {
        if (!hash_equals((string) config('services.gps_upload.token'), $token)) {
            abort(404);
        }

        $file = $request->file('file') ?? $request->file('data');

        if ($file) {
            $name = $file->getClientOriginalName() ?: ('upload_' . now()->format('YmdHis'));
            $path = $file->storeAs('', $name, 'ftpgps');
        } else {
            // Some device firmwares POST the raw file body directly rather than multipart form
            // data — fall back to writing the request body as-is when no file field is present.
            $raw = $request->getContent();
            if ($raw === '') {
                return response()->json(['message' => 'No file content received.'], 422);
            }
            $name = $request->query('filename', 'upload_' . now()->format('YmdHis') . '.bin');
            Storage::disk('ftpgps')->put($name, $raw);
            $path = $name;
        }

        Log::info('GPS file upload received', ['path' => $path]);

        return response()->json(['stored' => $path]);
    }
}
