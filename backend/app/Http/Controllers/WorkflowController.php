<?php

namespace App\Http\Controllers;

use App\Models\Workflow;
use Illuminate\Http\Request;

class WorkflowController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $query = Workflow::query()->with('steps')->latest();

        if ($companyId = $request->user()?->company_id) {
            $query->where('company_id', $companyId);
        }

        return $this->ok($query->get());
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $workflow = Workflow::query()
            ->with('steps')
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        return $this->ok($workflow);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'module' => 'required|string|max:255',
            'definition' => 'required|array',
            'steps' => 'required|array|min:1',
            'steps.*.step_order' => 'required|integer|min:1',
            'steps.*.approver_type' => 'required|string|max:255',
            'steps.*.approver_identifier' => 'required|string|max:255',
            'steps.*.conditions' => 'nullable|array',
        ]);

        $workflow = Workflow::create([
            'name' => $validated['name'],
            'module' => $validated['module'],
            'definition' => $validated['definition'],
            'company_id' => $request->user()?->company_id,
        ]);

        foreach ($validated['steps'] as $step) {
            $workflow->steps()->create([
                'step_order' => $step['step_order'],
                'approver_type' => $step['approver_type'],
                'approver_identifier' => $step['approver_identifier'],
                'conditions' => $step['conditions'] ?? [],
            ]);
        }

        return $this->ok($workflow->load('steps'), 'Workflow created', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $workflow = Workflow::query()
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'module' => 'sometimes|string|max:255',
            'definition' => 'sometimes|array',
            'steps' => 'sometimes|array|min:1',
            'steps.*.step_order' => 'required_with:steps|integer|min:1',
            'steps.*.approver_type' => 'required_with:steps|string|max:255',
            'steps.*.approver_identifier' => 'required_with:steps|string|max:255',
            'steps.*.conditions' => 'nullable|array',
        ]);

        $workflow->fill(array_filter([
            'name' => $validated['name'] ?? null,
            'module' => $validated['module'] ?? null,
            'definition' => $validated['definition'] ?? null,
        ]))->save();

        if (isset($validated['steps'])) {
            $workflow->steps()->delete();
            foreach ($validated['steps'] as $step) {
                $workflow->steps()->create([
                    'step_order' => $step['step_order'],
                    'approver_type' => $step['approver_type'],
                    'approver_identifier' => $step['approver_identifier'],
                    'conditions' => $step['conditions'] ?? [],
                ]);
            }
        }

        return $this->ok($workflow->load('steps'), 'Workflow updated');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $workflow = Workflow::query()
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        if ($workflow->approvals()->exists()) {
            return $this->fail('Workflow cannot be deleted while approvals exist.', 422);
        }

        $workflow->steps()->delete();
        $workflow->delete();

        return $this->ok(null, 'Workflow deleted');
    }
}
