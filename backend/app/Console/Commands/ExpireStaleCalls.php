<?php

namespace App\Console\Commands;

use App\Events\CallEnded;
use App\Models\Call;
use App\Models\CallParticipant;
use App\Services\CallNotificationService;
use Illuminate\Console\Command;

class ExpireStaleCalls extends Command
{
    protected $signature   = 'calls:expire-stale';
    protected $description = 'Mark calls left ringing for too long (never answered/rejected) as missed';

    public function handle(CallNotificationService $callNotifications): int
    {
        $timeoutSeconds = (int) config('calls.ringing_timeout_seconds', 60);

        $calls = Call::withoutGlobalScopes()
            ->where('status', 'ringing')
            ->where('created_at', '<', now()->subSeconds($timeoutSeconds))
            ->get();

        $count = 0;

        foreach ($calls as $call) {
            $call->update(['status' => 'missed', 'ended_at' => now()]);

            $allParticipantIds = CallParticipant::query()
                ->where('call_id', $call->id)
                ->pluck('user_id')
                ->toArray();

            CallParticipant::query()
                ->where('call_id', $call->id)
                ->whereIn('status', ['invited', 'joined'])
                ->update(['status' => 'left', 'left_at' => now()]);

            $missedUserIds = array_values(array_diff($allParticipantIds, [$call->initiated_by]));
            $callNotifications->notifyMissedCall($call, $missedUserIds);

            event(new CallEnded($call->id, $allParticipantIds));

            $count++;
        }

        $this->info("Expired {$count} stale ringing call(s)");

        return self::SUCCESS;
    }
}
