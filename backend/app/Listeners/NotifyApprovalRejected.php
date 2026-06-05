<?php

namespace App\Listeners;

use App\Events\ApprovalRejected;
use App\Models\NotificationItem;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalRejected implements ShouldQueue
{
    use InteractsWithQueue;

    public function handle(ApprovalRejected $event): void
    {
        $approval = $event->approval;
        $workflow = $approval->workflow;

        // Notify requester of rejection
        NotificationItem::create([
            'user_id' => $approval->requested_by,
            'type' => 'approval_rejected',
            'title' => "{$workflow->module} approval rejected",
            'message' => "Your {$workflow->module} request #{$approval->id} has been rejected. Please review and resubmit.",
            'data' => [
                'approval_id' => $approval->id,
                'module' => $workflow->module,
                'status' => 'rejected',
                'notes' => $approval->getLatestNote('rejection'),
            ],
            'read_at' => null,
        ]);
    }
}
