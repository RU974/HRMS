<?php

namespace App\Listeners;

use App\Events\ApprovalApproved;
use App\Models\NotificationItem;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalApproved implements ShouldQueue
{
    use InteractsWithQueue;

    public function handle(ApprovalApproved $event): void
    {
        $approval = $event->approval;
        $workflow = $approval->workflow;

        // Notify requester
        NotificationItem::create([
            'user_id' => $approval->requested_by,
            'type' => 'approval_approved',
            'title' => "{$workflow->module} approval approved",
            'message' => "Your {$workflow->module} request #{$approval->id} has been approved.",
            'data' => [
                'approval_id' => $approval->id,
                'module' => $workflow->module,
                'status' => 'approved',
            ],
            'read_at' => null,
        ]);

        // Notify next approver if workflow continues
        $nextStep = $approval->nextStep();
        if ($nextStep) {
            $approverIds = $this->getApproverIds($nextStep);
            foreach ($approverIds as $userId) {
                NotificationItem::create([
                    'user_id' => $userId,
                    'type' => 'approval_pending',
                    'title' => "{$workflow->module} approval awaits your action",
                    'message' => "Request #{$approval->id} has moved to step {$nextStep->step_number}. Your approval is needed.",
                    'data' => [
                        'approval_id' => $approval->id,
                        'module' => $workflow->module,
                        'step' => $nextStep->step_number,
                    ],
                    'read_at' => null,
                ]);
            }
        }
    }

    private function getApproverIds($nextStep): array
    {
        if ($nextStep->approver_type === 'role') {
            return \App\Models\User::whereHas('role', function ($q) {
                $q->where('id', $nextStep->approver_identifier);
            })->pluck('id')->toArray();
        } elseif ($nextStep->approver_type === 'user') {
            return [(int) $nextStep->approver_identifier];
        }

        return [];
    }
}
