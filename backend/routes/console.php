<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ─── License maintenance ───────────────────────────────────────────────────────

// Mark unactivated trial licenses as expired after config('licenses.trial_days') days.
Schedule::command('licenses:expire-trials')->dailyAt('00:05');

// Email licensees whose licenses expire in 30, 14, 7, or 1 day(s).
Schedule::command('licenses:notify-expiring')->dailyAt('08:00');
