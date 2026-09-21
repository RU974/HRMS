<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Lightweight "you have a new message" ping sent to each recipient's personal
 * channel. Drives unread badges, list ordering and desktop notifications
 * without subscribing to every conversation channel. Carries only a short
 * preview, never the full message body or attachment metadata.
 */
class ChatInboxUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  int[]  $recipientUserIds
     */
    public function __construct(
        private readonly int $conversationId,
        private readonly int $messageId,
        private readonly int $senderId,
        private readonly string $senderName,
        private readonly ?string $conversationName,
        private readonly string $preview,
        private readonly array $recipientUserIds
    ) {
    }

    public function broadcastOn(): array
    {
        return array_map(
            fn ($id) => new PrivateChannel('chat.user.' . $id),
            $this->recipientUserIds
        );
    }

    public function broadcastAs(): string
    {
        return 'chat.inbox.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'message_id' => $this->messageId,
            'sender_id' => $this->senderId,
            'sender_name' => $this->senderName,
            'conversation_name' => $this->conversationName,
            'preview' => $this->preview,
        ];
    }
}
