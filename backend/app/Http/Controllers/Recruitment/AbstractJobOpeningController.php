<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Approval;
use App\Models\CandidateCheck;
use App\Models\JobOpening;
use App\Services\Recruitment\FitScoringService;
use App\Services\Recruitment\HeadcountService;
use App\Services\Recruitment\JobRequisitionService;
use App\Services\Recruitment\TalentPoolService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

abstract class AbstractJobOpeningController extends Controller
{
    use EnsuresCompanyIsolation;

    protected const RELATIONS = ['department', 'hiringManager', 'recruiter', 'requester'];

    protected function validateDepartmentExists(Request $request, string $field = 'department_id')
    {
        return Rule::exists('departments', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
            $query->whereNull('deleted_at');
        });
    }

    protected function validateUserInCompany(Request $request)
    {
        return Rule::exists('users', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
        });
    }

    protected function withCounts()
    {
        return JobOpening::with(self::RELATIONS)->withCount([
            'candidates',
            'candidates as hired_count' => fn ($query) => $query->where('stage', 'hired'),
        ]);
    }

    protected function assertSalaryRange(array $validated, ?JobOpening $job = null): void
    {
        $min = array_key_exists('salary_min', $validated) ? $validated['salary_min'] : $job?->salary_min;
        $max = array_key_exists('salary_max', $validated) ? $validated['salary_max'] : $job?->salary_max;

        if ($min !== null && $max !== null && (float) $max < (float) $min) {
            throw ValidationException::withMessages(['salary_max' => ['The maximum salary cannot be lower than the minimum salary.']]);
        }
    }

    protected function sharedRules(Request $request, string $presence): array
    {
        return [
            'department_id' => [$presence === 'required' ? 'nullable' : 'sometimes', 'nullable', $this->validateDepartmentExists($request)],
            'employment_type' => ($presence === 'required' ? 'nullable' : 'sometimes') . '|in:full_time,part_time,contract,internship',
            'location' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|string|max:255',
            'description' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|string',
            'requirements' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|string|max:10000',
            'status' => ($presence === 'required' ? 'nullable' : 'sometimes') . '|in:open,closed,on_hold',
            'open_positions' => ($presence === 'required' ? 'nullable' : 'sometimes') . '|integer|min:1|max:1000',
            'posted_at' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|date',
            'closed_at' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|date|after_or_equal:posted_at',
            'hiring_manager_id' => [$presence === 'required' ? 'nullable' : 'sometimes', 'nullable', $this->validateUserInCompany($request)],
            'recruiter_id' => [$presence === 'required' ? 'nullable' : 'sometimes', 'nullable', $this->validateUserInCompany($request)],
            'salary_min' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|numeric|min:0|max:99999999',
            'salary_max' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|numeric|min:0|max:99999999',
            'salary_currency' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|string|max:10',
            'is_public' => ($presence === 'required' ? 'nullable' : 'sometimes') . '|boolean',
            'justification' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|string|max:2000',
            // Check types that must be cleared before a hire, and the extra reward for an employee referral.
            'required_checks' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|array|max:3',
            'required_checks.*' => ['string', Rule::in(CandidateCheck::TYPES)],
            'auto_reject_knockouts' => ($presence === 'required' ? 'nullable' : 'sometimes') . '|boolean',
            'referral_bonus_amount' => ($presence === 'required' ? 'nullable' : 'sometimes|nullable') . '|numeric|min:0|max:99999999999',
        ];
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $query = $this->withCounts()->latest('id');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('title', 'like', "%{$q}%")
                    ->orWhere('location', 'like', "%{$q}%")
                    ->orWhere('employment_type', 'like', "%{$q}%");
            });
        }

        return $this->ok($query->paginate(min(max((int) $request->input('per_page', 15), 1), 100)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:create');

        $validated = $request->validate(['title' => 'required|string|max:255'] + $this->sharedRules($request, 'required'));
        $this->assertSalaryRange($validated);

        $requisitions = app(JobRequisitionService::class);

        if ($requisitions->requiresApproval($request->user()?->company_id)) {
            $job = $requisitions->createRequisition(Arr::except($validated, ['status', 'posted_at', 'closed_at']) + [
                'employment_type' => $validated['employment_type'] ?? 'full_time',
                'open_positions' => $validated['open_positions'] ?? 1,
                'is_public' => (bool) ($validated['is_public'] ?? false),
            ], $request->user());

            return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition submitted for approval', 201);
        }

        $status = $validated['status'] ?? 'open';

        $job = JobOpening::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
            'requested_by' => $request->user()?->id,
            'employment_type' => $validated['employment_type'] ?? 'full_time',
            'status' => $status,
            'open_positions' => $validated['open_positions'] ?? 1,
            'is_public' => (bool) ($validated['is_public'] ?? false),
            'closed_at' => $status === 'closed' ? ($validated['closed_at'] ?? now()->toDateString()) : null,
        ]);

        app(HeadcountService::class)->refresh($job);

        if ($job->status === 'open') {
            app(TalentPoolService::class)->notifyMatches($job);
        }

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job opening created successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        return $this->ok($this->withCounts()->findOrFail($job->id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        $validated = $request->validate(['title' => 'sometimes|string|max:255'] + $this->sharedRules($request, 'sometimes'));
        $this->assertSalaryRange($validated, $job);

        if ($job->status === 'pending_approval') {
            throw ValidationException::withMessages(['status' => ['This job is waiting for approval and cannot be edited. Withdraw the requisition first.']]);
        }

        if ($job->status === 'rejected' && isset($validated['status']) && $validated['status'] !== 'rejected'
            && app(JobRequisitionService::class)->requiresApproval($job->company_id)) {
            throw ValidationException::withMessages(['status' => ['This requisition has not been approved. Submit it for approval instead.']]);
        }

        if (isset($validated['status'])) {
            if ($validated['status'] === 'closed') {
                $validated['closed_at'] = $validated['closed_at'] ?? $job->closed_at?->toDateString() ?? now()->toDateString();
            } else {
                $validated['closed_at'] = null;
            }
        }

        $wasOpen = $job->status === 'open';
        $job->update($validated);

        // Requirements decide the fit score, so applicants are scored again when the job text changes.
        if ($job->wasChanged(['title', 'description', 'requirements'])) {
            app(FitScoringService::class)->rescoreJob($job);
        }

        app(HeadcountService::class)->refresh($job);

        if (! $wasOpen && $job->status === 'open') {
            app(TalentPoolService::class)->notifyMatches($job);
        }

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job opening updated successfully');
    }

    /** Talent-pool people who look like a match for this opening, best fit first. */
    public function suggestedCandidates(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        return $this->ok(app(FitScoringService::class)->suggestFromPool($job, 15, 30));
    }

    public function submitRequisition(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        app(JobRequisitionService::class)->submit($job, $request->user());

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition submitted for approval');
    }

    public function withdrawRequisition(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:edit', 'recruitment:request']);

        $job = $this->resolveTenantModel(JobOpening::class, $id);
        $this->assertOwnRequisition($request, $job);

        app(JobRequisitionService::class)->withdraw($job);

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition withdrawn');
    }

    /** Approvers hold approvals:approve (route-level) and the HR Manager / Company Admin role (checked in the service). */
    public function approveRequisition(Request $request, $id)
    {
        $job = $this->resolveTenantModel(JobOpening::class, $id);
        $validated = $request->validate(['notes' => 'nullable|string|max:1024']);

        app(JobRequisitionService::class)->decide($job, $request->user(), true, $validated['notes'] ?? null);

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition approved');
    }

    public function rejectRequisition(Request $request, $id)
    {
        $job = $this->resolveTenantModel(JobOpening::class, $id);
        $validated = $request->validate(['notes' => 'required|string|max:1024']);

        app(JobRequisitionService::class)->decide($job, $request->user(), false, $validated['notes']);

        return $this->ok($this->withCounts()->findOrFail($job->id), 'Job requisition rejected');
    }

    /** Requesters without full recruitment access may only act on requisitions they raised themselves. */
    protected function assertOwnRequisition(Request $request, JobOpening $job): void
    {
        $user = $request->user();

        if ($user->hasAnyPermission(['recruitment:edit'])) {
            return;
        }

        abort_unless((int) $job->requested_by === (int) $user->id, 403, 'You can only manage requisitions that you requested.');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:delete');

        $job = $this->resolveTenantModel(JobOpening::class, $id);

        $candidateCount = $job->candidates()->count();
        if ($candidateCount > 0) {
            return $this->fail(
                sprintf('This job has %d candidate(s) and cannot be deleted. Close it instead.', $candidateCount),
                422
            );
        }

        // A requisition that is deleted while waiting must not leave a pending approval behind.
        if ($job->status === 'pending_approval' && $job->approval_id) {
            Approval::query()->whereKey($job->approval_id)->where('status', 'pending')
                ->update(['status' => 'rejected', 'rejected_at' => now()]);
        }

        $job->delete();

        return $this->ok(null, 'Job opening deleted successfully');
    }
}
