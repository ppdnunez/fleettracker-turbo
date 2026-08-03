<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Device-facing webhook — no session/CSRF token available, guarded by its own signature instead.
        $middleware->validateCsrfTokens(except: [
            'img/uploads/face/uploadPic',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
