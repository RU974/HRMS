<?php

namespace App\Listeners;

use App\Events\LeaveStatusChanged;
use App\Services\LeaveNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyLeaveStatusChanged implements ShouldQueue
{
    use InteractsWithQueue;

    public function __construct(private readonly LeaveNotificationService $notificationService) {}

    public function handle(LeaveStatusChanged $event): void
    {
        // Only notify on terminal / actionable status transitions
        $notifiableStatuses = ['approved', 'rejected', 'cancelled'];

        if (!in_array($event->leave->status, $notifiableStatuses, true)) {
            return;
        }

        // Don't fire if status didn't actually change
        if ($event->leave->status === $event->previousStatus) {
            return;
        }

        $this->notificationService->notifyEmployee($event->leave, $event->previousStatus);
    }
}
