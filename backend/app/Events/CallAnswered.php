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
        private readonly array $recipientUserIds
    ) {}

    /**
     * Broadcast to every other current participant (not just the initiator) so
     * group calls with 3+ people build a complete peer-connection mesh — each
     * existing participant needs to learn about every other joiner, not only
     * the call's original initiator.
     */
    public function broadcastOn(): array
    {
        return array_map(
            fn ($id) => new PrivateChannel('call.' . $id),
            $this->recipientUserIds
        );
    }

    public function broadcastWith(): array
    {
        return ['call' => $this->call];
    }
}
