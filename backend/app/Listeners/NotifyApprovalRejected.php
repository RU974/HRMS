<?php

namespace App\Listeners;

use App\Events\ApprovalRejected;
use App\Listeners\Concerns\NotifiesApprovalParticipants;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalRejected implements ShouldQueue
{
    use InteractsWithQueue;
    use NotifiesApprovalParticipants;

    public function handle(ApprovalRejected $event): void
    {
        $approval = $event->approval->loadMissing('workflow');

        if ($this->handledByModule($approval)) {
            return;
        }

        $module = $approval->workflow?->module ?? $approval->module;

        $this->notify($approval, [$approval->requested_by], 'approval_rejected', "{$module} approval rejected", "Your {$module} request #{$approval->id} has been rejected. Please review and resubmit.");
    }
}
