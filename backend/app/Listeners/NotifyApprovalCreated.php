<?php

namespace App\Listeners;

use App\Events\ApprovalCreated;
use App\Listeners\Concerns\NotifiesApprovalParticipants;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalCreated implements ShouldQueue
{
    use InteractsWithQueue;
    use NotifiesApprovalParticipants;

    public function handle(ApprovalCreated $event): void
    {
        $approval = $event->approval->loadMissing(['workflow', 'currentStep']);

        if ($this->handledByModule($approval)) {
            return;
        }

        $module = $approval->workflow?->module ?? $approval->module;

        $this->notify(
            $approval,
            array_diff($this->currentApproverIds($approval), [$approval->requested_by]),
            'approval_pending',
            "New {$module} approval awaits your action",
            "Request #{$approval->id} requires your approval. Module: {$module}"
        );
    }
}
