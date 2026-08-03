<?php

namespace App\Services;

use App\Models\FaceUploadReceipt;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;

/**
 * Our own implementation of TurboHive's device-facing face image ingest API
 * (POST /face/uploadPic — see face-upload-api.md), so the JC171 can be pointed at our own host
 * instead of TurboHive's/a third party's. Request shape, signature algorithm and the
 * {code,message,data} response contract all follow that doc exactly. Every request — accepted or
 * rejected — is logged to face_upload_receipts so the admin UI can show what we replied.
 */
class FaceUploadService
{
    /** Files land here — publicly reachable at <host>/img/uploads/<filename> (see face-upload-api.md's "Notes"). */
    private const UPLOAD_DIR = 'img/uploads';

    public function handle(Request $request): array
    {
        $imei          = (string) $request->input('imei', '');
        $instructionId = (string) $request->input('instructionId', '');
        $timestamp     = (string) $request->input('timestamp', '');
        $sign          = (string) $request->input('sign', '');
        $file          = $request->file('file');

        $result = $this->validateAndStore($imei, $instructionId, $timestamp, $sign, $file);

        FaceUploadReceipt::create([
            'imei'              => $imei ?: null,
            'instruction_id'    => $instructionId ?: null,
            'file_name'         => $file?->getClientOriginalName(),
            'stored_path'       => $result['stored_path'] ?? null,
            'signature_valid'   => $result['signature_valid'] ?? null,
            'response_code'     => $result['code'],
            'response_message'  => $result['message'],
            'ip'                => $request->ip(),
            'user_agent'        => $request->userAgent(),
        ]);

        unset($result['stored_path'], $result['signature_valid']);

        return $result;
    }

    private function validateAndStore(string $imei, string $instructionId, string $timestamp, string $sign, ?UploadedFile $file): array
    {
        if ($imei === '') {
            return ['code' => 400, 'message' => 'The imei cannot be empty'];
        }
        if ($instructionId === '') {
            return ['code' => 400, 'message' => 'The instructionId cannot be empty'];
        }
        if ($timestamp === '') {
            return ['code' => 400, 'message' => 'The timestamp cannot be empty'];
        }
        if ($sign === '') {
            return ['code' => 400, 'message' => 'The sign cannot be empty'];
        }
        if (!$file) {
            return ['code' => 400, 'message' => 'The file cannot be empty'];
        }

        $secretKey = (string) config('services.turbohive.face_upload_secret_key');
        $expected  = rtrim(base64_encode(md5($imei . $instructionId . $secretKey . $timestamp)));
        $signValid = hash_equals($expected, $sign);

        if (!$signValid) {
            return ['code' => 400, 'message' => 'Signature error', 'signature_valid' => false];
        }

        try {
            $storedName = $this->store($file);
        } catch (\Throwable $e) {
            return ['code' => 500, 'message' => 'File upload failed', 'signature_valid' => true];
        }

        return [
            'code'             => 200,
            'message'          => 'File upload success',
            'data'             => $storedName,
            'stored_path'      => self::UPLOAD_DIR . '/' . $storedName,
            'signature_valid'  => true,
        ];
    }

    /** Duplicate filenames are allowed by the spec — existing files are never overwritten, so collisions get a unique suffix. */
    private function store(UploadedFile $file): string
    {
        $dir = public_path(self::UPLOAD_DIR);
        if (!File::isDirectory($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        $original  = $file->getClientOriginalName() ?: ('upload_' . now()->format('YmdHis') . '.jpg');
        $extension = pathinfo($original, PATHINFO_EXTENSION);
        $base      = pathinfo($original, PATHINFO_FILENAME);
        $name      = $original;

        while (File::exists($dir . DIRECTORY_SEPARATOR . $name)) {
            $suffix = substr(uniqid(), -6);
            $name   = $extension !== '' ? "{$base}-{$suffix}.{$extension}" : "{$base}-{$suffix}";
        }

        $file->move($dir, $name);

        return $name;
    }
}
