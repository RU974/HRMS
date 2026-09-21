<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/** Roster / host changed on a live call — refreshes every listed participant. */
class CallUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly array $call,
        private readonly array $recipientUserIds
    ) {}

    public function broadcastOn(): array
    {
        return array_map(
            fn ($id) => new PrivateChannel('call.' . $id),
            $this->recipientUserIds
        );
    }

    public function broadcastAs(): string
    {
        return 'call.updated';
    }

    public function broadcastWith(): array
    {
        return ['call' => $this->call];
    }
}
