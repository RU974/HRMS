<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * "You have a new notification" ping to the recipient's personal channel, so the bell and
 * notification list refresh at once instead of waiting for the next poll. Carries only the
 * headline and the deep link; the browser re-reads the list for everything else.
 */
class NotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        private readonly int $userId,
        private readonly int $notificationId,
        private readonly string $type,
        private readonly string $title,
        private readonly ?string $link
    ) {
    }

    public function broadcastOn(): array
    {
        return [new PrivateChannel('notifications.user.' . $this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->notificationId,
            'type' => $this->type,
            'title' => $this->title,
            'link' => $this->link,
        ];
    }
}
