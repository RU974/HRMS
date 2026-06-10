<?php

namespace App\Listeners;

use App\Events\LeaveRequested;
use App\Services\LeaveNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyLeaveRequested implements ShouldQueue
{
    use InteractsWithQueue;

    public function __construct(private readonly LeaveNotificationService $notificationService) {}

    public function handle(LeaveRequested $event): void
    {
        $this->notificationService->notifyApprovers($event->leave);
    }
}
