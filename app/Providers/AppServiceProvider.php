<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Contracts\GpsProviderInterface;
use App\Services\TraccarService;
use App\Services\TurboHiveService;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(GpsProviderInterface::class, function () {
            return match (config('services.gps.provider')) {
                'turbohive' => new TurboHiveService(),
                default => new TraccarService(),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
