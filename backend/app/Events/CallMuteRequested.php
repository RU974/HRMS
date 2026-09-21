<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallMuteRequested implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly int $callId,
        private readonly int $targetUserId
    ) {}

    /** Broadcast only to the participant the host is muting. */
    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('call.' . $this->targetUserId);
    }

    public function broadcastWith(): array
    {
        return ['call_id' => $this->callId];
    }

    public function broadcastAs(): string
    {
        return 'call.mute_requested';
    }
}
