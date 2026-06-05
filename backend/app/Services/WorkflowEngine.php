<?php

namespace App\Services;

use App\Events\ApprovalCreated;
use App\Models\Workflow;
use App\Models\Approval;
use App\Models\ApprovalStep;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;

class WorkflowEngine
{
    public function startWorkflow(string $module, int $moduleId, Workflow $workflow, int $requestedBy, array $metadata = []) : Approval
    {
        $approval = Approval::create([
            'module' => $module,
            'module_id' => $moduleId,
            'workflow_id' => $workflow->id,
            'status' => 'pending',
            'requested_by' => $requestedBy,
            'company_id' => $workflow->company_id,
            'metadata' => $metadata,
        ]);

        // set to first step
        $first = $workflow->steps()->orderBy('step_order')->first();
        if ($first) {
            $approval->current_step_id = $first->id;
            $approval->save();
        }

        // Dispatch approval created event
        Event::dispatch(new ApprovalCreated($approval));

        return $approval;
    }

    public function getNextStep(Approval $approval) : ?ApprovalStep
    {
        $current = $approval->currentStep;
        if (! $current) return null;

        return ApprovalStep::where('workflow_id', $current->workflow_id)
            ->where('step_order', '>', $current->step_order)
            ->orderBy('step_order')
            ->first();
    }
}
