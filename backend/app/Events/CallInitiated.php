<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallInitiated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly array $call,
        private readonly array $recipientUserIds
    ) {}

    /** Broadcast to every invited participant's private channel. */
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
