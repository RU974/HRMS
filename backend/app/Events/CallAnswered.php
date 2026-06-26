<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallAnswered implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly array $call,
        private readonly int $initiatorUserId
    ) {}

    /** Broadcast to the call initiator so they know someone answered. */
    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('call.' . $this->initiatorUserId);
    }

    public function broadcastWith(): array
    {
        return ['call' => $this->call];
    }
}
