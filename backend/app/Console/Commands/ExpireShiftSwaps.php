<?php

namespace App\Console\Commands;

use App\Models\ShiftSwap;
use Illuminate\Console\Command;

class ExpireShiftSwaps extends Command
{
    protected $signature = 'shifts:expire-swaps';

    protected $description = 'Cancel swap requests that nobody answered before the day of the swap arrived';

    public function handle(): int
    {
        $count = ShiftSwap::withoutGlobalScopes()
            ->whereIn('status', [ShiftSwap::PENDING_PEER, ShiftSwap::PENDING_APPROVAL])
            ->where(fn ($q) => $q->whereDate('requester_date', '<', today())->orWhereDate('counterpart_date', '<', today()))
            ->update(['status' => ShiftSwap::CANCELLED, 'decision_notes' => 'Expired: the day arrived before the swap was settled.', 'decided_at' => now()]);

        $this->info("Expired {$count} swap request(s).");

        return self::SUCCESS;
    }
}
