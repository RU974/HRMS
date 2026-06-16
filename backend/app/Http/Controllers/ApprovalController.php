<?php

namespace App\Http\Controllers;

use App\Models\Approval;
use App\Models\AuditLog;
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
            ->with(['workflow', 'currentStep.approvers'])
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
            ->with(['workflow', 'currentStep.approvers', 'requester:id,name,email'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        $auditTrail = AuditLog::query()
            ->where('approval_id', $approval->id)
            ->with('user:id,name,email')
            ->latest()
            ->get();

        $approval->setAttribute('audit_trail', $auditTrail);

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
            ->with(['workflow', 'currentStep.approvers'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        if ($approval->status !== 'pending') {
            return $this->fail('Approval has already been completed.', 422);
        }

        $this->ensureUserIsEligibleApprover($request, $approval);

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
            ->with(['workflow', 'currentStep.approvers'])
            ->when($request->user()?->company_id, function ($query, $companyId) {
                $query->where('company_id', $companyId);
            })
            ->findOrFail($id);

        if ($approval->status !== 'pending') {
            return $this->fail('Approval has already been completed.', 422);
        }

        $this->ensureUserIsEligibleApprover($request, $approval);

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

    /**
     * Beyond the blanket approvals:approve permission, confirm this user is actually one of
     * the current step's resolved approvers (role/user/dynamic, including active delegates).
     * Company Admin / Super Admin bypass via the Gate::before override already in place.
     */
    private function ensureUserIsEligibleApprover(Request $request, Approval $approval): void
    {
        $user = $request->user();
        if ($user->hasAnyRole([\App\Models\User::ROLE_SUPER_ADMIN, \App\Models\User::ROLE_COMPANY_ADMIN])) {
            return;
        }

        $step = $approval->currentStep;
        if (!$step) {
            return;
        }

        $eligible = $step->approverUserIds($approval->requested_by, $approval->company_id);
        if ($eligible->isNotEmpty() && !$eligible->contains($user->id)) {
            abort(403, 'You are not an approver for the current step of this request.');
        }
    }
}
