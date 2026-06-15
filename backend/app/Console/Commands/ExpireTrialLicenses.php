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
        $cutoff    = now()->subDays($trialDays);

        $count = License::query()
            ->where('status', 'trial')
            ->where('is_active', true)
            ->whereNull('activated_at')
            ->where('issued_at', '<=', $cutoff)
            ->update(['status' => 'expired']);

        $this->info("Expired {$count} trial license(s) older than {$trialDays} days.");

        return self::SUCCESS;
    }
}
