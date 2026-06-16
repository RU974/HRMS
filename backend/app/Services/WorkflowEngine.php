<?php

namespace App\Services;

use App\Events\ApprovalCreated;
use App\Models\Workflow;
use App\Models\Approval;
use App\Models\ApprovalStep;
use Illuminate\Support\Facades\Event;

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

        // set to the first step whose conditions match the request metadata
        $first = $this->firstMatchingStep($workflow, $metadata);
        if ($first) {
            $approval->current_step_id = $first->id;
        }

        $approval->due_at = $this->dueAtFor($workflow, $first);
        $approval->save();

        // Dispatch approval created event
        Event::dispatch(new ApprovalCreated($approval));

        return $approval;
    }

    public function getNextStep(Approval $approval) : ?ApprovalStep
    {
        $current = $approval->currentStep;
        if (! $current) return null;

        $candidates = ApprovalStep::where('workflow_id', $current->workflow_id)
            ->where('step_order', '>', $current->step_order)
            ->orderBy('step_order')
            ->get();

        $metadata = $approval->metadata ?? [];

        foreach ($candidates as $candidate) {
            if (ConditionEvaluator::matches($candidate->conditions, $metadata)) {
                return $candidate;
            }
        }

        return null;
    }

    public function dueAtFor(Workflow $workflow, ?ApprovalStep $step): ?\Illuminate\Support\Carbon
    {
        $hours = $step?->escalation_hours ?? $workflow->escalation_hours ?? config('approval.escalation_threshold_hours');

        return $hours ? now()->addHours((int) $hours) : null;
    }

    private function firstMatchingStep(Workflow $workflow, array $metadata): ?ApprovalStep
    {
        $steps = $workflow->steps()->orderBy('step_order')->get();

        foreach ($steps as $step) {
            if (ConditionEvaluator::matches($step->conditions, $metadata)) {
                return $step;
            }
        }

        return null;
    }
}
