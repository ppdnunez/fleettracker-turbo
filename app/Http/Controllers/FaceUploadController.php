<?php

namespace App\Http\Controllers;

use App\Models\FaceUploadReceipt;
use App\Services\FaceUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}
