<?php

namespace App\Providers;

use App\Events\LeaveRequested;
use App\Events\LeaveStatusChanged;
use App\Listeners\NotifyLeaveRequested;
use App\Listeners\NotifyLeaveStatusChanged;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Ticket;
use App\Models\TicketComment;
use App\Observers\TicketCommentObserver;
use App\Observers\TicketObserver;
use App\Policies\ChatConversationPolicy;
use App\Policies\ChatMessagePolicy;
use App\Policies\TicketPolicy;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Gate;
use App\Models\User;

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

        RateLimiter::for('orbit', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(20)->by(sprintf('%s|%s', (string) $request->ip(), (string) $userId));
        });

        RateLimiter::for('communication', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(60)->by(sprintf('%s|%s', (string) $request->ip(), (string) $userId));
        });

        RateLimiter::for('biometric-agent', function (Request $request): Limit {
            return Limit::perMinute(30)->by((string) $request->ip());
        });

        ResetPassword::createUrlUsing(function (object $notifiable, string $token): string {
            $frontendUrl = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/');
            $email = urlencode((string) $notifiable->getEmailForPasswordReset());

            return $frontendUrl . '/auth/reset-password?token=' . urlencode($token) . '&email=' . $email;
        });

        // Leave request notifications
        Event::listen(LeaveRequested::class, NotifyLeaveRequested::class);
        Event::listen(LeaveStatusChanged::class, NotifyLeaveStatusChanged::class);

        // Ticket notifications
        Ticket::observe(TicketObserver::class);
        TicketComment::observe(TicketCommentObserver::class);

        // Explicitly register policies to avoid implicit resolution surprises
        Gate::policy(ChatMessage::class, ChatMessagePolicy::class);
        Gate::policy(ChatConversation::class, ChatConversationPolicy::class);
        Gate::policy(Ticket::class, TicketPolicy::class);

        // Grant Super Admin unconditional access to all policies and gates.
        Gate::before(function ($user, $ability) {
            if ($user instanceof User && $user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
                return true;
            }

            return null;
        });
    }
}
