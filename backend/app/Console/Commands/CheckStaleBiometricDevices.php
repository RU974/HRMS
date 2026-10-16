<?php

namespace App\Console\Commands;

use App\Services\AttendanceNotificationService;
use Illuminate\Console\Command;

class CheckStaleBiometricDevices extends Command
{
    protected $signature   = 'biometric:check-stale {--company= : Limit to one company id}';
    protected $description = 'Alert HR when a biometric device or its agent has stopped syncing (and when it recovers).';

    public function handle(AttendanceNotificationService $notifications): int
    {
        $sent = $notifications->deviceSyncHealth($this->option('company') ? (string) $this->option('company') : null);

        $this->info("Sent {$sent} device sync notification(s).");

        return self::SUCCESS;
    }
}
