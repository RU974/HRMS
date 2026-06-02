<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('auth', function (Request $request): Limit {
            return Limit::perMinute(10)->by(sprintf('%s|%s', (string) $request->ip(), (string) $request->input('email')));
        });

        RateLimiter::for('search', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(30)->by(sprintf('%s|%s', (string) $request->ip(), (string) $userId));
        });

        RateLimiter::for('communication', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(60)->by(sprintf('%s|%s', (string) $request->ip(), (string) $userId));
        });

        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            $frontendUrl = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');
            $email = urlencode((string) $notifiable->getEmailForPasswordReset());

            return $frontendUrl . '/auth/reset-password?token=' . urlencode($token) . '&email=' . $email;
        });
    }
}
