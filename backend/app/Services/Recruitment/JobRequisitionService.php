<?php

namespace App\Services\Recruitment;

use App\Models\Approval;
use App\Models\ApprovalResponse;
use App\Models\ApprovalStep;
use App\Models\Company;
use App\Models\JobOpening;
use App\Models\User;
use App\Models\Workflow;
use App\Services\ApprovalEngine;
use App\Services\WorkflowEngine;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A job requisition is a job opening that has to be approved before it goes live. It reuses
 * the generic approval engine with one "HR Manager" step per company, exactly like offers.
 */
class JobRequisitionService
{
    /** Cost or headcount beyond what a department is approved for needs the Company Admin as well as the HR Manager. */
    public const EXECUTIVE_ROLE = User::ROLE_COMPANY_ADMIN;

    public function __construct(
        private readonly RecruitmentNotificationService $notifications,
        private readonly HeadcountService $headcount,
        private readonly TalentPoolService $pool,
    ) {
    }

    public function requiresApproval(?string $companyId): bool
    {
        return $companyId !== null
            && (bool) Company::query()->whereKey($companyId)->value('requisition_approval_required');
    }

    /** Create a job as a requisition and send it for approval in one step. */
    public function createRequisition(array $attributes, User $actor): JobOpening
    {
        return DB::transaction(function () use ($attributes, $actor) {
            $job = JobOpening::create([
                ...$attributes,
                'company_id' => $actor->company_id,
                'status' => 'rejected',
                'requested_by' => $actor->id,
                'posted_at' => null,
                'closed_at' => null,
            ]);

            return $this->submit($job, $actor);
        });
    }

    public function submit(JobOpening $job, User $actor): JobOpening
    {
        if ($job->status !== 'rejected') {
            throw ValidationException::withMessages(['status' => ['Only a requisition that has not been approved yet can be submitted for approval.']]);
        }

        if (! filled($job->title)) {
            throw ValidationException::withMessages(['title' => ['A requisition needs a job title.']]);
        }

        $check = $this->headcount->check($job);

        DB::transaction(function () use ($job, $actor, $check) {
            $approval = (new WorkflowEngine())->startWorkflow(
                JobOpening::APPROVAL_MODULE,
                $job->id,
                $this->workflowFor($job->company_id),
                $actor->id,
                [
                    'title' => $job->title,
                    'department_id' => $job->department_id,
                    'open_positions' => (int) $job->open_positions,
                    'employment_type' => $job->employment_type,
                    'estimated_cost' => $check['estimated_cost'],
                    'requires_executive' => $check['requires_executive'],
                ]
            );

            $job->update([
                'estimated_cost' => $check['estimated_cost'] ?: null,
                'budget_check' => $check,
                'status' => 'pending_approval',
                'approval_id' => $approval->id,
                'approval_note' => null,
                'requested_by' => $job->requested_by ?? $actor->id,
                'submitted_at' => now(),
            ]);
        });

        $this->notifications->notifyUsers(
            $this->approverIds($job->company_id),
            'recruitment_requisition',
            'Job requisition awaiting approval: ' . $job->title,
            sprintf('A request to open %d position(s) for %s needs your approval.', (int) $job->open_positions, $job->title)
                . ($check['requires_executive'] ? ' It exceeds the approved headcount or cost, so the Company Admin must approve it after you.' : ''),
            $job->company_id,
            $actor->id,
            '/recruitment/jobs'
        );

        return $job->fresh();
    }

    public function decide(JobOpening $job, User $actor, bool $approve, ?string $note = null): JobOpening
    {
        if ($job->status !== 'pending_approval' || ! $job->approval_id) {
            throw ValidationException::withMessages(['status' => ['This requisition is not waiting for approval.']]);
        }

        $approval = Approval::query()->findOrFail($job->approval_id);

        if ($approval->status !== 'pending') {
            throw ValidationException::withMessages(['status' => ['This approval has already been completed.']]);
        }

        $isAdmin = $actor->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN]);
        $executiveStep = $approval->currentStep?->approver_identifier === self::EXECUTIVE_ROLE;

        if (! $isAdmin && ! $actor->hasAnyRole(OfferService::APPROVER_ROLES)) {
            abort(403, 'Only an HR Manager or Company Admin can approve job requisitions.');
        }

        if ($executiveStep && ! $isAdmin) {
            abort(403, 'This requisition is over the approved headcount or cost, so only a Company Admin can give the final approval.');
        }

        if (! $isAdmin && (int) $approval->requested_by === (int) $actor->id) {
            abort(403, 'You cannot approve a requisition that you submitted yourself.');
        }

        $engine = new ApprovalEngine();
        $approve ? $engine->approve($approval, $actor->id, ['notes' => $note]) : $engine->reject($approval, $actor->id, ['notes' => $note]);

        $approval = $approval->fresh();
        $result = $this->applyApprovalResult($approval) ?? $job->fresh();

        // The HR Manager said yes but the request is over budget: it now waits for the Company Admin.
        if ($approve && $approval->status === 'pending' && $approval->currentStep?->approver_identifier === self::EXECUTIVE_ROLE) {
            $this->notifications->notifyUsers(
                $this->approverIds($job->company_id, true),
                'recruitment_requisition',
                'Final approval needed: ' . $job->title,
                'This requisition is over the approved headcount or cost and was approved by HR. It needs your decision.',
                $job->company_id,
                $actor->id,
                '/recruitment/jobs'
            );
        }

        return $result;
    }

    /**
     * Mirror the final outcome of an approval onto its job. Safe to call repeatedly and for
     * approvals that belong to another module.
     */
    public function applyApprovalResult(Approval $approval): ?JobOpening
    {
        if ($approval->module !== JobOpening::APPROVAL_MODULE) {
            return null;
        }

        $job = JobOpening::query()->withoutGlobalScopes()->find($approval->module_id);

        if (! $job || (int) $job->approval_id !== (int) $approval->id || $job->status !== 'pending_approval') {
            return $job;
        }

        if ($approval->status === 'approved') {
            $job->update(['status' => 'open', 'posted_at' => $job->posted_at ?? now()->toDateString(), 'closed_at' => null]);
            $this->pool->notifyMatches($job);
        } elseif ($approval->status === 'rejected') {
            $note = ApprovalResponse::query()
                ->where('approval_id', $approval->id)
                ->where('decision', 'reject')
                ->latest('id')
                ->value('notes');

            $job->update(['status' => 'rejected', 'approval_note' => $note]);
        } else {
            return $job;
        }

        $this->notifications->notifyUsers(
            [$job->requested_by],
            'recruitment_requisition',
            sprintf('Job requisition %s: %s', $job->status === 'open' ? 'approved' : 'rejected', $job->title),
            $job->status === 'open'
                ? 'Your requisition was approved and the job is now open.'
                : 'Your requisition was rejected' . ($job->approval_note ? ': ' . $job->approval_note : '.') . ' You can edit it and submit it again.',
            $job->company_id,
            null,
            '/recruitment/jobs'
        );

        return $job->fresh();
    }

    /** The requester takes a pending requisition back; it can be edited and submitted again. */
    public function withdraw(JobOpening $job): JobOpening
    {
        if ($job->status !== 'pending_approval') {
            throw ValidationException::withMessages(['status' => ['Only a requisition that is waiting for approval can be withdrawn.']]);
        }

        DB::transaction(function () use ($job) {
            if ($job->approval_id) {
                Approval::query()->whereKey($job->approval_id)->where('status', 'pending')
                    ->update(['status' => 'rejected', 'rejected_at' => now()]);
            }

            $job->update(['status' => 'rejected', 'approval_note' => 'Withdrawn by the requester.']);
        });

        return $job->fresh();
    }

    /** @return array<int, int> */
    private function approverIds(?string $companyId, bool $executiveOnly = false): array
    {
        return User::query()
            ->where('company_id', $companyId)
            ->whereHas('roles', fn ($query) => $query->whereIn('name', $executiveOnly ? [self::EXECUTIVE_ROLE] : OfferService::APPROVER_ROLES))
            ->pluck('id')
            ->all();
    }

    private function workflowFor(?string $companyId): Workflow
    {
        $workflow = Workflow::firstOrCreate(
            ['module' => JobOpening::APPROVAL_MODULE, 'company_id' => $companyId],
            ['name' => 'Job requisition approval', 'definition' => ['description' => 'Approval of new job requisitions before they go live', 'notifications' => 'module']]
        );

        if (! $workflow->steps()->exists()) {
            ApprovalStep::create([
                'workflow_id' => $workflow->id,
                'step_order' => 1,
                'approver_type' => 'role',
                'approver_identifier' => User::ROLE_HR_MANAGER,
                'conditions' => [],
                'required_approvals' => 1,
            ]);
        }

        // Second step, only taken when the request is over the approved headcount/cost (see HeadcountService).
        if (! $workflow->steps()->where('step_order', 2)->exists()) {
            ApprovalStep::create([
                'workflow_id' => $workflow->id,
                'step_order' => 2,
                'approver_type' => 'role',
                'approver_identifier' => self::EXECUTIVE_ROLE,
                'conditions' => [['field' => 'requires_executive', 'operator' => '==', 'value' => true]],
                'required_approvals' => 1,
            ]);
        }

        return $workflow;
    }
}
