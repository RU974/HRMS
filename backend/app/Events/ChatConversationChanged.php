<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * A conversation was created, renamed, or its membership changed. `action`
 * is one of: created, renamed, member_added, member_removed, removed, left.
 * "removed" is sent to the affected user so their client can drop the thread.
 */
class ChatConversationChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  int[]  $recipientUserIds
     */
    public function __construct(
        private readonly int $conversationId,
        private readonly string $action,
        private readonly array $recipientUserIds
    ) {
    }

    public function broadcastOn(): array
    {
        return array_map(
            fn ($id) => new PrivateChannel('chat.user.' . $id),
            array_values(array_unique($this->recipientUserIds))
        );
    }

    public function broadcastAs(): string
    {
        return 'chat.conversation.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'action' => $this->action,
        ];
    }
}
