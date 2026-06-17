<?php

namespace App\Console\Commands;

use App\Models\License;
use Illuminate\Console\Command;

class ExpireTrialLicenses extends Command
{
    protected $signature   = 'licenses:expire-trials';
    protected $description = 'Mark unactivated trial licenses as expired after the configured trial period.';

    public function handle(): int
    {
        $trialDays = config('licenses.trial_days', 14);

        // Trial age must be judged in each company's own timezone, not the
        // server's default — otherwise a license issued late in the day for a
        // company several hours behind UTC could be expired up to a day early.
        $candidates = License::query()
            ->where('status', 'trial')
            ->where('is_active', true)
            ->whereNull('activated_at')
            ->where('issued_at', '<=', now()->subDays($trialDays))
            ->with('company:id,timezone')
            ->get();

        $expiredIds = $candidates->filter(function (License $license) use ($trialDays) {
            $timezone = $license->company?->timezone ?: config('app.timezone');
            $cutoff   = now($timezone)->subDays($trialDays);

            return $license->issued_at->copy()->setTimezone($timezone)->lte($cutoff);
        })->pluck('id');

        $count = $expiredIds->isEmpty()
            ? 0
            : License::whereIn('id', $expiredIds)->update(['status' => 'expired']);

        $this->info("Expired {$count} trial license(s) older than {$trialDays} days.");

        return self::SUCCESS;
    }
}
