<?php

namespace App\Http\Controllers;

use App\Services\TurboHiveService;
use Illuminate\Http\JsonResponse;

class TurboHiveController extends Controller
{
    public function __construct(protected TurboHiveService $turboHive)
    {
    }

    public function location(string $imei): JsonResponse
    {
        $location = $this->turboHive->getDeviceLocation($imei);

        return response()->json($location);
    }
}
