<?php

namespace App\Http\Controllers;

use App\Models\FaceUploadReceipt;
use App\Services\FaceUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class FaceUploadController extends Controller
{
    public function __construct(protected FaceUploadService $faceUpload)
    {
    }

    /**
     * Device-facing webhook — POST /img/uploads/face/uploadPic (see face-upload-api.md).
     * Public route (no auth:sanctum — the device can't hold a user session), guarded instead by
     * the request's own signature (imei+instructionId+secretKey+timestamp, per the doc).
     */
    public function uploadPic(Request $request): JsonResponse
    {
        // Raw dump of exactly what arrived, logged before any validation/signature check touches
        // it — so a device that's failing (or never even reaching us) can be diagnosed straight
        // from storage/logs/laravel.log ("tail -f storage/logs/laravel.log" while the device
        // fires) instead of only seeing the final, filtered result the face_upload_receipts row
        // shows. 'file' is logged as metadata only — the binary itself would be useless in a log.
        Log::info('face/uploadPic — raw incoming request', [
            'ip'         => $request->ip(),
            'method'     => $request->method(),
            'url'        => $request->fullUrl(),
            'params'     => $request->except(['file']),
            'file'       => $request->hasFile('file') ? [
                'original_name' => $request->file('file')->getClientOriginalName(),
                'size_bytes'     => $request->file('file')->getSize(),
                'mime_type'      => $request->file('file')->getClientMimeType(),
            ] : null,
            'headers'    => $request->headers->all(),
        ]);

        $result = $this->faceUpload->handle($request);

        return response()->json($result, $result['code']);
    }

    /** The URL to push to a device (via DriverFaceController::setUploadUrl) so it lands here. */
    public function config(): JsonResponse
    {
        return response()->json(['host' => config('services.turbohive.face_upload_inbound_host')]);
    }

    /** Admin-facing history of what this webhook has received/replied — the "module" view. */
    public function index(Request $request): JsonResponse
    {
        $query = FaceUploadReceipt::orderByDesc('created_at');

        if ($imei = $request->query('imei')) {
            $query->where('imei', $imei);
        }
        if ($startDate = $request->query('startDate')) {
            $query->where('created_at', '>=', $startDate);
        }
        if ($endDate = $request->query('endDate')) {
            $query->where('created_at', '<=', $endDate);
        }

        return response()->json($query->limit(200)->get());
    }

    /**
     * Tails storage/logs/laravel.log for uploadPic()'s own raw-request log lines, newest first —
     * the web-UI equivalent of `tail -f storage/logs/laravel.log | grep face/uploadPic` on a
     * production box where SSH/cPanel Terminal access isn't always at hand. Only reads the last
     * MAX_TAIL_BYTES of the file rather than the whole thing, since Laravel's log can grow large
     * over time and this isn't meant to be a general-purpose log viewer.
     */
    private const MAX_TAIL_BYTES = 2 * 1024 * 1024;

    public function rawLog(Request $request): JsonResponse
    {
        $path = storage_path('logs/laravel.log');
        if (!is_file($path)) {
            return response()->json(['lines' => []]);
        }

        $limit  = min((int) $request->query('limit', 100), 500);
        $handle = fopen($path, 'r');
        if (filesize($path) > self::MAX_TAIL_BYTES) {
            fseek($handle, -self::MAX_TAIL_BYTES, SEEK_END);
            fgets($handle); // drop the first, possibly-truncated line
        }
        $content = stream_get_contents($handle);
        fclose($handle);

        $lines = array_values(array_filter(
            explode("\n", $content),
            fn ($line) => str_contains($line, 'face/uploadPic')
        ));

        return response()->json(['lines' => array_reverse(array_slice($lines, -$limit))]);
    }
}
