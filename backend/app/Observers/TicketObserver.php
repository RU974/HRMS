<?php

namespace App\Observers;

use App\Models\Ticket;
use App\Services\TicketNotificationService;

class TicketObserver
{
    public function __construct(private TicketNotificationService $notificationService) {}

    public function created(Ticket $ticket): void
    {
        $this->notificationService->notifyTicketCreated($ticket);
    }

    public function updated(Ticket $ticket): void
    {
        $statusChanged    = $ticket->wasChanged('status');
        $assignmentChanged = $ticket->wasChanged('assigned_to');

        if ($statusChanged) {
            $newStatus = $ticket->status;

            $this->notificationService->notifyStatusChanged($ticket);

            if ($newStatus === 'reopened') {
                $this->notificationService->notifyTicketReopened($ticket);
            }
        }

        if ($assignmentChanged && $ticket->assigned_to !== null) {
            $this->notificationService->notifyTicketAssigned($ticket);
        }
    }
}
