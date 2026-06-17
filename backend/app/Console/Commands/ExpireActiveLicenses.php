<?php

namespace App\Console\Commands;

use App\Models\License;
use Illuminate\Console\Command;

class ExpireActiveLicenses extends Command
{
    protected $signature   = 'licenses:expire-active';
    protected $description = 'Mark active/suspended-recoverable licenses as expired once their expires_at date has passed.';

    public function handle(): int
    {
        $count = License::query()
            ->where('is_active', true)
            ->whereIn('status', ['active', 'trial'])
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);

        $this->info("Expired {$count} license(s) past their expiry date.");

        return self::SUCCESS;
    }
}
