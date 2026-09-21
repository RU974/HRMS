<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * The user answered or declined an incoming call on another tab/device, so
 * every other client of theirs should stop ringing.
 */
class CallHandledElsewhere implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly int $callId,
        private readonly int $userId
    ) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('call.' . $this->userId);
    }

    public function broadcastAs(): string
    {
        return 'call.handled_elsewhere';
    }

    public function broadcastWith(): array
    {
        return ['call_id' => $this->callId];
    }
}
