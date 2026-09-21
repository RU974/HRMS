<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallEnded implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly int $callId,
        private readonly array $participantUserIds,
        /** ended | missed | declined | removed: lets the client say WHY the call closed. */
        private readonly string $reason = 'ended'
    ) {}

    /** Broadcast to every participant so they all close the call window. */
    public function broadcastOn(): array
    {
        return array_map(
            fn ($id) => new PrivateChannel('call.' . $id),
            $this->participantUserIds
        );
    }

    public function broadcastWith(): array
    {
        return ['call_id' => $this->callId, 'reason' => $this->reason];
    }

    public function broadcastAs(): string
    {
        return 'call.ended';
    }
}
