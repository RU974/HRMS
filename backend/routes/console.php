<?php

use App\Services\ApprovalEscalationService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ─── License maintenance ───────────────────────────────────────────────────────

// Mark unactivated trial licenses as expired after config('licenses.trial_days') days.
Schedule::command('licenses:expire-trials')->dailyAt('00:05');

// Mark active licenses as expired once their expires_at date has passed.
// Runs hourly so dashboards reflect expiry promptly without mutating data on read.
Schedule::command('licenses:expire-active')->hourly();

// Email licensees whose licenses expire in 30, 14, 7, or 1 day(s).
Schedule::command('licenses:notify-expiring')->dailyAt('08:00');

// Email trial licensees when 7, 3, or 1 day(s) remain before their trial ends.
Schedule::command('licenses:notify-trial-expiring')->dailyAt('08:10');

// Email licensees whose license has just expired (one-time notification, runs daily).
Schedule::command('licenses:notify-expired')->dailyAt('08:20');

// ─── Report delivery ───────────────────────────────────────────────────────

// Send saved reports whose daily/weekly schedule is due (checked hourly,
// actual cadence enforced by each report's stored next_run_at).
Schedule::command('reports:send-scheduled')->hourly();

// ─── Approvals ──────────────────────────────────────────────────────────────

// Escalate approvals that have sat pending past their threshold.
Schedule::call([ApprovalEscalationService::class, 'escalateOverdueApprovals'])->hourly();

// ─── Announcements ──────────────────────────────────────────────────────────

// Publish announcements whose scheduled published_at has arrived.
Schedule::command('announcements:publish-scheduled')->everyFiveMinutes();

// ─── Ticketing ──────────────────────────────────────────────────────────────

// Close tickets that have been resolved for more than 7 days.
Schedule::command('tickets:auto-close')->daily();

// ─── Biometric ──────────────────────────────────────────────────────────────

// Sync biometric devices whose scheduled interval is due.
Schedule::command('biometric:sync-scheduled')->everyFiveMinutes();
