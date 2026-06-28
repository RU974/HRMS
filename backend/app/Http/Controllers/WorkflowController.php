<?php

namespace App\Http\Controllers;

use App\Models\Workflow;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WorkflowController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $query = Workflow::query()->with('steps.approvers')->latest();
        $this->scopeToCompany($request, $query);
        return $this->ok($query->get());
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $query = Workflow::query()->with('steps.approvers');
        $this->scopeToCompany($request, $query);
        $workflow = $query->findOrFail($id);
        return $this->ok($workflow);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $validated = $request->validate($this->stepRules(true) + [
            'name' => 'required|string|max:255',
            'module' => 'required|string|max:255',
            'definition' => 'required|array',
            'escalation_hours' => 'nullable|integer|min:1',
            'steps' => 'required|array|min:1',
        ]);

        $workflow = Workflow::create([
            'name' => $validated['name'],
            'module' => $validated['module'],
            'definition' => $validated['definition'],
            'escalation_hours' => $validated['escalation_hours'] ?? null,
            'company_id' => $request->user()?->company_id,
        ]);

        $this->syncSteps($workflow, $validated['steps']);

        return $this->ok($workflow->load('steps.approvers'), 'Workflow created', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $wfQuery  = Workflow::query();
        $this->scopeToCompany($request, $wfQuery);
        $workflow = $wfQuery->findOrFail($id);

        $validated = $request->validate($this->stepRules(false) + [
            'name' => 'sometimes|string|max:255',
            'module' => 'sometimes|string|max:255',
            'definition' => 'sometimes|array',
            'escalation_hours' => 'nullable|integer|min:1',
            'steps' => 'sometimes|array|min:1',
        ]);

        $workflow->fill(array_filter([
            'name' => $validated['name'] ?? null,
            'module' => $validated['module'] ?? null,
            'definition' => $validated['definition'] ?? null,
        ]))->save();

        if (array_key_exists('escalation_hours', $validated)) {
            $workflow->escalation_hours = $validated['escalation_hours'];
            $workflow->save();
        }

        if (isset($validated['steps'])) {
            $workflow->steps()->delete();
            $this->syncSteps($workflow, $validated['steps']);
        }

        return $this->ok($workflow->load('steps.approvers'), 'Workflow updated');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $delQuery = Workflow::query();
        $this->scopeToCompany($request, $delQuery);
        $workflow = $delQuery->findOrFail($id);

        if ($workflow->approvals()->exists()) {
            return $this->fail('Workflow cannot be deleted while approvals exist.', 422);
        }

        $workflow->steps()->delete();
        $workflow->delete();

        return $this->ok(null, 'Workflow deleted');
    }

    private function stepRules(bool $required): array
    {
        $prefix = $required ? 'required' : 'sometimes';

        return [
            'steps.*.step_order' => "{$prefix}|integer|min:1",
            'steps.*.approver_type' => "{$prefix}|string|max:255",
            'steps.*.approver_identifier' => "{$prefix}|string|max:255",
            'steps.*.approvers' => 'nullable|array',
            'steps.*.approvers.*.approver_type' => 'required_with:steps.*.approvers|string|max:255',
            'steps.*.approvers.*.approver_identifier' => 'required_with:steps.*.approvers|string|max:255',
            'steps.*.conditions' => 'nullable|array',
            'steps.*.conditions.*.field' => 'required_with:steps.*.conditions|string|max:100',
            'steps.*.conditions.*.operator' => ['required_with:steps.*.conditions', Rule::in(['>', '>=', '<', '<=', '==', '!='])],
            'steps.*.conditions.*.value' => 'required_with:steps.*.conditions',
            'steps.*.required_approvals' => 'nullable|integer|min:1',
            'steps.*.approval_mode' => ['nullable', Rule::in(['first_n', 'all'])],
            'steps.*.escalation_hours' => 'nullable|integer|min:1',
        ];
    }

    private function syncSteps(Workflow $workflow, array $steps): void
    {
        foreach ($steps as $step) {
            $approvalStep = $workflow->steps()->create([
                'step_order' => $step['step_order'],
                'approver_type' => $step['approver_type'],
                'approver_identifier' => $step['approver_identifier'],
                'conditions' => $step['conditions'] ?? [],
                'required_approvals' => $step['required_approvals'] ?? 1,
                'approval_mode' => $step['approval_mode'] ?? 'first_n',
                'escalation_hours' => $step['escalation_hours'] ?? null,
            ]);

            $approvers = $step['approvers'] ?? [['approver_type' => $step['approver_type'], 'approver_identifier' => $step['approver_identifier']]];
            foreach ($approvers as $approver) {
                $approvalStep->approvers()->create([
                    'approver_type' => $approver['approver_type'],
                    'approver_identifier' => $approver['approver_identifier'],
                ]);
            }
        }
    }
}
