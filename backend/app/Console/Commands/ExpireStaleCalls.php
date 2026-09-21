<?php

namespace App\Console\Commands;

use App\Services\CallService;
use Illuminate\Console\Command;

class ExpireStaleCalls extends Command
{
    protected $signature   = 'calls:expire-stale';
    protected $description = 'Mark unanswered calls as missed and drop participants whose client stopped heartbeating';

    public function handle(CallService $calls): int
    {
        $result = $calls->expireStale();

        $this->info(sprintf(
            'Expired %d stale ringing call(s), removed %d disconnected participant(s), lapsed %d late invitation(s)',
            $result['missed_calls'],
            $result['stale_participants'],
            $result['lapsed_invitations']
        ));

        return self::SUCCESS;
    }
}
