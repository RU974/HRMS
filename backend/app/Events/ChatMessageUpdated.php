<?php

namespace App\Events;

use App\Models\ChatMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ChatMessageUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly ChatMessage $message)
    {
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('chat.' . $this->message->conversation_id);
    }

    public function broadcastAs(): string
    {
        return 'chat.message.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'message' => $this->message->loadMissing(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']),
        ];
    }
}
