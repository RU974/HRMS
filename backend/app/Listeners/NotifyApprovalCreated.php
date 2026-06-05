<?php

namespace App\Listeners;

use App\Events\ApprovalCreated;
use App\Models\NotificationItem;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;

class NotifyApprovalCreated implements ShouldQueue
{
    use InteractsWithQueue;

    public function handle(ApprovalCreated $event): void
    {
        $approval = $event->approval;
        $workflow = $approval->workflow;

        // Get the current step
        $currentStep = $approval->currentStep();
        if (!$currentStep) {
            return;
        }

        // Determine who needs to be notified
        $approverIds = $this->getApproverIds($currentStep);

        // Create notifications for each approver
        foreach ($approverIds as $userId) {
            NotificationItem::create([
                'user_id' => $userId,
                'type' => 'approval_pending',
                'title' => "New {$workflow->module} approval awaits your action",
                'message' => "Request #{$approval->id} requires your approval. Module: {$workflow->module}",
                'data' => [
                    'approval_id' => $approval->id,
                    'module' => $workflow->module,
                    'step' => $currentStep->step_number,
                ],
                'read_at' => null,
            ]);
        }
    }

    private function getApproverIds($currentStep): array
    {
        if ($currentStep->approver_type === 'role') {
            // Get all users with this role
            return \App\Models\User::whereHas('role', function ($q) {
                $q->where('id', $currentStep->approver_identifier);
            })->pluck('id')->toArray();
        } elseif ($currentStep->approver_type === 'user') {
            // Get specific user
            return [(int) $currentStep->approver_identifier];
        }

        return [];
    }
}
