<?php

namespace App\Listeners;

use App\Events\ApprovalEscalated;
use App\Models\NotificationItem;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalEscalated implements ShouldQueue
{
    use InteractsWithQueue;

    public function handle(ApprovalEscalated $event): void
    {
        $approval = $event->approval;
        $workflow = $approval->workflow;
        $reason = $event->reason ?? 'Escalation due to pending approval timeout';

        // Get HR Manager role ID for escalation
        $hrManagerRole = \App\Models\Role::where('name', 'HR Manager')->first();
        if (!$hrManagerRole) {
            return;
        }

        // Notify HR Managers
        $hrManagerIds = \App\Models\User::whereHas('role', function ($q) use ($hrManagerRole) {
            $q->where('id', $hrManagerRole->id);
        })->pluck('id')->toArray();

        foreach ($hrManagerIds as $userId) {
            NotificationItem::create([
                'user_id' => $userId,
                'type' => 'approval_escalated',
                'title' => "{$workflow->module} approval escalated",
                'message' => "Approval request #{$approval->id} has been escalated. Reason: {$reason}",
                'data' => [
                    'approval_id' => $approval->id,
                    'module' => $workflow->module,
                    'reason' => $reason,
                    'priority' => 'high',
                ],
                'read_at' => null,
            ]);
        }

        // Also notify requester
        NotificationItem::create([
            'user_id' => $approval->requested_by,
            'type' => 'approval_escalated',
            'title' => "Your {$workflow->module} request has been escalated",
            'message' => "Your approval request #{$approval->id} has been escalated to management: {$reason}",
            'data' => [
                'approval_id' => $approval->id,
                'module' => $workflow->module,
            ],
            'read_at' => null,
        ]);
    }
}
