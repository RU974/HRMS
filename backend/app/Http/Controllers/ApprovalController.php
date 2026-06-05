<?php

namespace App\Http\Controllers;

use App\Models\Approval;
use App\Models\Workflow;
use App\Services\ApprovalEngine;
use App\Services\WorkflowEngine;
use Illuminate\Http\Request;

class ApprovalController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'approvals:view');

        $query = Approval::query()
            ->with(['workflow', 'currentStep'])
            ->latest();

        if ($companyId = $request->user()?->company_id) {
            $query->where('company_id', $companyId);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('module')) {
            $query->where('module', $request->input('module'));
        }

        return $this->ok($query->get());
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:view');

        $approval = Approval::query()
            ->with(['workflow', 'currentStep'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        return $this->ok($approval);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'approvals:manage_settings');

        $validated = $request->validate([
            'module' => 'required|string|max:255',
            'module_id' => 'required|integer|min:1',
            'workflow_id' => 'required|integer|exists:workflows,id',
            'metadata' => 'nullable|array',
        ]);

        $workflow = Workflow::query()
            ->whereKey($validated['workflow_id'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->firstOrFail();

        $approval = (new WorkflowEngine())->startWorkflow(
            $validated['module'],
            $validated['module_id'],
            $workflow,
            $request->user()->id,
            $validated['metadata'] ?? [],
        );

        return $this->ok($approval->load(['workflow', 'currentStep']), 'Approval started', 201);
    }

    public function approve(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:approve');

        $approval = Approval::query()
            ->with(['workflow', 'currentStep'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        if ($approval->status !== 'pending') {
            return $this->fail('Approval has already been completed.', 422);
        }

        $validated = $request->validate([
            'notes' => 'nullable|string|max:1024',
        ]);

        $approval = (new ApprovalEngine())->approve(
            $approval,
            $request->user()->id,
            ['notes' => $validated['notes'] ?? null],
        );

        return $this->ok($approval->load(['workflow', 'currentStep']), 'Approval updated');
    }

    public function reject(Request $request, int $id)
    {
        $this->authorizePermission($request, 'approvals:approve');

        $approval = Approval::query()
            ->with(['workflow', 'currentStep'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        if ($approval->status !== 'pending') {
            return $this->fail('Approval has already been completed.', 422);
        }

        $validated = $request->validate([
            'notes' => 'nullable|string|max:1024',
        ]);

        $approval = (new ApprovalEngine())->reject(
            $approval,
            $request->user()->id,
            ['notes' => $validated['notes'] ?? null],
        );

        return $this->ok($approval->load(['workflow', 'currentStep']), 'Approval rejected');
    }
}
