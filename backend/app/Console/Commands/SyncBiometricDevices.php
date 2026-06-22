<?php

namespace App\Console\Commands;

use App\Models\BiometricDevice;
use App\Services\BiometricSyncService;
use Illuminate\Console\Command;

class SyncBiometricDevices extends Command
{
    protected $signature   = 'biometric:sync-scheduled';
    protected $description = 'Sync all biometric devices whose scheduled interval is due.';

    public function handle(BiometricSyncService $syncService): int
    {
        $devices = BiometricDevice::query()
            ->where('sync_mode', 'scheduled')
            ->where('status', '!=', 'offline')
            ->get();

        if ($devices->isEmpty()) {
            $this->info('No scheduled biometric devices found.');
            return self::SUCCESS;
        }

        foreach ($devices as $device) {
            $intervalMinutes = (int) ($device->sync_interval_minutes ?? 60);
            $due = $device->last_sync_at === null
                || now()->diffInMinutes($device->last_sync_at) >= $intervalMinutes;

            if (!$due) {
                $this->line("[{$device->name}] Skipped — not yet due.");
                continue;
            }

            try {
                $log = $syncService->sync($device);
                $this->info("[{$device->name}] Synced — status: {$log->status}, fetched: {$log->records_fetched}.");
            } catch (\Throwable $e) {
                $this->error("[{$device->name}] Failed — {$e->getMessage()}");
            }
        }

        return self::SUCCESS;
    }
}
