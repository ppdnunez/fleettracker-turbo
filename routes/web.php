<?php

use App\Http\Controllers\FaceUploadController;
use Illuminate\Support\Facades\Route;

// Device-facing face image ingest API — see face-upload-api.md.
Route::post('/img/uploads/face/uploadPic', [FaceUploadController::class, 'uploadPic']);

Route::get('/{any?}', function () {
    return view('app');
})->where('any', '.*');
