<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallRejected implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly int $callId,
        private readonly int $rejectedByUserId,
        private readonly int $initiatorUserId
    ) {}

    /** Broadcast to the initiator so they know a participant declined. */
    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('call.' . $this->initiatorUserId);
    }

    public function broadcastWith(): array
    {
        return [
            'call_id'     => $this->callId,
            'rejected_by' => $this->rejectedByUserId,
        ];
    }
}
