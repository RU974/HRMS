<?php

namespace App\Listeners;

use App\Events\ApprovalApproved;
use App\Listeners\Concerns\NotifiesApprovalParticipants;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalApproved implements ShouldQueue
{
    use InteractsWithQueue;
    use NotifiesApprovalParticipants;

    public function handle(ApprovalApproved $event): void
    {
        $approval = $event->approval->loadMissing(['workflow', 'currentStep']);

        if ($this->handledByModule($approval)) {
            return;
        }

        $module = $approval->workflow?->module ?? $approval->module;

        if ($approval->status === 'approved') {
            $this->notify($approval, [$approval->requested_by], 'approval_approved', "{$module} approval approved", "Your {$module} request #{$approval->id} has been approved.");

            return;
        }

        // The approval moved on to its next step: ask that step's approvers.
        $this->notify(
            $approval,
            array_diff($this->currentApproverIds($approval), [$approval->requested_by]),
            'approval_pending',
            "{$module} approval awaits your action",
            "Request #{$approval->id} has moved to the next step. Your approval is needed."
        );
    }
}
