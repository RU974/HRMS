<?php

namespace App\Services;

use App\Events\ApprovalApproved;
use App\Events\ApprovalRejected;
use App\Models\Approval;
use App\Models\ApprovalStep;
use App\Services\AuditService;
use Illuminate\Support\Facades\Event;

class ApprovalEngine
{
    public function approve(Approval $approval, int $approverId, array $notes = []) : Approval
    {
        $next = (new WorkflowEngine())->getNextStep($approval);

        if ($next) {
            $approval->current_step_id = $next->id;
            $approval->save();
        } else {
            $approval->status = 'approved';
            $approval->approved_at = now();
            $approval->save();
        }

        // record audit
        AuditService::record([
            'action' => 'approve',
            'module' => $approval->module,
            'company_id' => $approval->company_id,
            'old_value' => null,
            'new_value' => ['status' => $approval->status, 'current_step_id' => $approval->current_step_id],
        ]);

        // Dispatch approval event
        Event::dispatch(new ApprovalApproved($approval));

        return $approval;
    }

    public function reject(Approval $approval, int $approverId, array $notes = []) : Approval
    {
        $approval->status = 'rejected';
        $approval->rejected_at = now();
        $approval->save();

        AuditService::record([
            'action' => 'reject',
            'module' => $approval->module,
            'company_id' => $approval->company_id,
            'old_value' => null,
            'new_value' => ['status' => $approval->status],
        ]);

        // Dispatch rejection event
        Event::dispatch(new ApprovalRejected($approval));

        return $approval;
    }
}
