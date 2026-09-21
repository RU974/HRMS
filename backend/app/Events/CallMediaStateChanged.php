<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/** A participant toggled mic / camera / screen share — lets peers render real state. */
class CallMediaStateChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly int $callId,
        private readonly int $userId,
        private readonly array $state,
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
        return 'call.media_state';
    }

    public function broadcastWith(): array
    {
        return [
            'call_id' => $this->callId,
            'user_id' => $this->userId,
            'muted' => (bool) ($this->state['muted'] ?? false),
            'camera_off' => (bool) ($this->state['camera_off'] ?? false),
            'screen_sharing' => (bool) ($this->state['screen_sharing'] ?? false),
        ];
    }
}
