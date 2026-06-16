<?php

namespace App\Services;

use App\Events\ApprovalApproved;
use App\Events\ApprovalRejected;
use App\Models\Approval;
use App\Models\ApprovalResponse;
use App\Services\AuditService;
use Illuminate\Support\Facades\Event;

class ApprovalEngine
{
    public function approve(Approval $approval, int $approverId, array $notes = []) : Approval
    {
        $step = $approval->currentStep;

        if ($step) {
            ApprovalResponse::query()->updateOrCreate(
                ['approval_id' => $approval->id, 'approval_step_id' => $step->id, 'approver_user_id' => $approverId],
                ['decision' => 'approve', 'notes' => $notes['notes'] ?? null, 'responded_at' => now()],
            );
        }

        $approvalsReceived = $step
            ? $step->responses()->where('approval_id', $approval->id)->where('decision', 'approve')->count()
            : 1;

        $required = $step?->required_approvals ?? 1;

        if ($step && $approvalsReceived < $required) {
            // Still waiting on other required approvers for this step.
            AuditService::record([
                'action' => 'approve_step',
                'module' => $approval->module,
                'company_id' => $approval->company_id,
                'approval_id' => $approval->id,
                'old_value' => null,
                'new_value' => ['step_id' => $step->id, 'approvals_received' => $approvalsReceived, 'required' => $required],
            ]);

            return $approval;
        }

        $workflowEngine = new WorkflowEngine();
        $next = $workflowEngine->getNextStep($approval);

        if ($next) {
            $approval->current_step_id = $next->id;
            $approval->due_at = $workflowEngine->dueAtFor($approval->workflow, $next);
            $approval->save();
        } else {
            $approval->status = 'approved';
            $approval->approved_at = now();
            $approval->due_at = null;
            $approval->save();
        }

        AuditService::record([
            'action' => 'approve',
            'module' => $approval->module,
            'company_id' => $approval->company_id,
            'approval_id' => $approval->id,
            'old_value' => null,
            'new_value' => ['status' => $approval->status, 'current_step_id' => $approval->current_step_id],
        ]);

        Event::dispatch(new ApprovalApproved($approval));

        return $approval;
    }

    public function reject(Approval $approval, int $approverId, array $notes = []) : Approval
    {
        $step = $approval->currentStep;

        if ($step) {
            ApprovalResponse::query()->updateOrCreate(
                ['approval_id' => $approval->id, 'approval_step_id' => $step->id, 'approver_user_id' => $approverId],
                ['decision' => 'reject', 'notes' => $notes['notes'] ?? null, 'responded_at' => now()],
            );
        }

        $approval->status = 'rejected';
        $approval->rejected_at = now();
        $approval->due_at = null;
        $approval->save();

        AuditService::record([
            'action' => 'reject',
            'module' => $approval->module,
            'company_id' => $approval->company_id,
            'approval_id' => $approval->id,
            'old_value' => null,
            'new_value' => ['status' => $approval->status],
        ]);

        Event::dispatch(new ApprovalRejected($approval));

        return $approval;
    }
}
