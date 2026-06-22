<?php

namespace App\Observers;

use App\Models\TicketComment;
use App\Services\TicketNotificationService;

class TicketCommentObserver
{
    public function __construct(private TicketNotificationService $notificationService) {}

    public function created(TicketComment $comment): void
    {
        $this->notificationService->notifyCommentAdded($comment);
    }
}
