<?php

namespace App\Providers;

use App\Broadcasting\ResilientPusherBroadcaster;
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
use Illuminate\Contracts\Broadcasting\Factory as BroadcastFactory;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
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
        // Replace the built-in Reverb driver with one that never lets a websocket
        // outage turn a successful request into a 500 (see the class for details).
        Broadcast::extend('reverb', function ($app, array $config) {
            return new ResilientPusherBroadcaster($app->make(BroadcastFactory::class)->pusher($config), $config['jsonp'] ?? false);
        });

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

        // Every ICE candidate is its own request, so signalling needs far more
        // headroom than ordinary API calls or a call setup would be throttled.
        RateLimiter::for('call-signal', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(600)->by(sprintf('call-signal|%s', (string) $userId));
        });

        RateLimiter::for('call-action', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(30)->by(sprintf('call-action|%s', (string) $userId));
        });

        RateLimiter::for('chat-send', function (Request $request): Limit {
            $userId = $request->user()?->id ?? 'guest';

            return Limit::perMinute(60)->by(sprintf('chat-send|%s', (string) $userId));
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
