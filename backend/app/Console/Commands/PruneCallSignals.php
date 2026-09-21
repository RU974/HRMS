<?php

namespace App\Console\Commands;

use App\Models\CallSignal;
use Illuminate\Console\Command;

class PruneCallSignals extends Command
{
    protected $signature   = 'calls:prune-signals';
    protected $description = 'Delete old WebRTC signalling rows';

    public function handle(): int
    {
        $hours = max(1, (int) config('calls.signal_retention_hours', 24));

        $deleted = CallSignal::query()
            ->where('created_at', '<', now()->subHours($hours))
            ->delete();

        $this->info("Pruned {$deleted} call signal(s) older than {$hours}h");

        return self::SUCCESS;
    }
}
