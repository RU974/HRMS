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
        // Holds the company's exchange rates for the length of a request.
        $this->app->singleton(\App\Services\Recruitment\CurrencyService::class);

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

        // Public careers site: generous reads, strict applications per visitor.
        RateLimiter::for('careers-read', function (Request $request): Limit {
            return Limit::perMinute(60)->by('careers-read:' . $request->ip());
        });

        RateLimiter::for('careers-apply', function (Request $request): array {
            return [
                Limit::perMinute(6)->by('careers-apply:' . $request->ip()),
                Limit::perHour(30)->by('careers-apply-hour:' . $request->ip()),
            ];
        });

        // A candidate answering an offer or uploading a handful of documents; per link and per visitor.
        RateLimiter::for('portal-write', function (Request $request): Limit {
            return Limit::perMinute(30)->by('portal-write:' . $request->ip() . '|' . $request->route('token'));
        });

        // Emailing a signing code: few per link so the inbox cannot be flooded.
        RateLimiter::for('portal-code', function (Request $request): array {
            return [
                Limit::perMinute(3)->by('portal-code:' . $request->route('token')),
                Limit::perHour(10)->by('portal-code-hour:' . $request->route('token')),
            ];
        });

        // Asking for a portal link rotates it, so one address cannot be hammered.
        RateLimiter::for('portal-link', function (Request $request): array {
            return [
                Limit::perHour(3)->by('portal-link:' . $request->ip() . '|' . mb_strtolower((string) $request->input('email'))),
                Limit::perHour(12)->by('portal-link-ip:' . $request->ip()),
            ];
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

        // Offers mirror the outcome of their approval (see OfferService::applyApprovalResult).
        // Job requisitions do the same (see JobRequisitionService::applyApprovalResult).
        $syncRecruitmentApproval = function ($event) {
            app(\App\Services\Recruitment\OfferService::class)->applyApprovalResult($event->approval);
            app(\App\Services\Recruitment\JobRequisitionService::class)->applyApprovalResult($event->approval);
        };
        Event::listen(\App\Events\ApprovalApproved::class, $syncRecruitmentApproval);
        Event::listen(\App\Events\ApprovalRejected::class, $syncRecruitmentApproval);

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
