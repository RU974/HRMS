<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\JobOpening;
use App\Models\RecruitmentAgency;
use App\Models\ReferralBonus;
use App\Services\Recruitment\ReferralService;
use App\Services\Recruitment\ResumeStorageService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Agencies, referral bonuses (staff) and the employee-facing "refer a candidate" flow. Employees only ever
 * see their own referrals and a plain-language status, never the candidate's file.
 */
class ReferralController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly ReferralService $referrals)
    {
    }

    // ---- agencies ---------------------------------------------------------------

    public function agencies(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $agencies = RecruitmentAgency::query()
            ->withCount([
                'candidates',
                'candidates as hired_count' => fn ($query) => $query->where('stage', 'hired'),
            ])
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return $this->ok($agencies);
    }

    private function agencyRules(string $presence): array
    {
        return [
            'name' => $presence . '|string|max:160',
            'contact_name' => 'sometimes|nullable|string|max:160',
            'email' => 'sometimes|nullable|email:rfc|max:255',
            'phone' => 'sometimes|nullable|string|max:50',
            'fee_percent' => 'sometimes|nullable|numeric|min:0|max:100',
            'terms' => 'sometimes|nullable|string|max:3000',
            'is_active' => 'sometimes|boolean',
        ];
    }

    public function storeAgency(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $validated = $request->validate($this->agencyRules('required'));
        $agency = RecruitmentAgency::create($validated + ['company_id' => $request->user()?->company_id]);

        return $this->ok($agency, 'Agency added', 201);
    }

    public function updateAgency(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $agency = $this->resolveTenantModel(RecruitmentAgency::class, $id);
        $agency->update($request->validate($this->agencyRules('sometimes')));

        return $this->ok($agency->fresh(), 'Agency updated');
    }

    public function destroyAgency(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $agency = $this->resolveTenantModel(RecruitmentAgency::class, $id);

        if ($agency->candidates()->exists()) {
            return $this->fail('This agency has candidates and cannot be deleted. Mark it inactive instead.', 422);
        }

        $agency->delete();

        return $this->ok(null, 'Agency deleted');
    }

    // ---- bonuses ----------------------------------------------------------------

    public function bonuses(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $companyId = $request->user()?->company_id;
        $this->referrals->refresh($companyId);

        $validated = $request->validate([
            'status' => ['nullable', Rule::in(ReferralBonus::STATUSES)],
            'type' => ['nullable', Rule::in(['referral', 'agency'])],
        ]);

        $query = ReferralBonus::query()
            ->with(['candidate:id,full_name,stage,job_opening_id,employee_id', 'candidate.jobOpening:id,title', 'employee', 'agency:id,name'])
            ->latest('id');

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (($validated['type'] ?? null) === 'referral') {
            $query->whereNotNull('employee_id');
        } elseif (($validated['type'] ?? null) === 'agency') {
            $query->whereNotNull('agency_id');
        }

        $totals = ReferralBonus::query()
            ->selectRaw('status, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount')
            ->groupBy('status')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->status => ['count' => (int) $row->count, 'amount' => (float) $row->amount]]);

        return $this->ok([
            'bonuses' => $query->limit(300)->get(),
            'totals' => $totals,
            'wait_days' => (int) \App\Models\Company::query()->whereKey($companyId)->value('referral_bonus_wait_days'),
        ]);
    }

    private function bonus(Request $request, $id): ReferralBonus
    {
        return $this->resolveTenantModel(ReferralBonus::class, $id);
    }

    public function updateBonus(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $bonus = $this->bonus($request, $id);
        $validated = $request->validate(['amount' => 'sometimes|nullable|numeric|min:0|max:99999999999', 'notes' => 'sometimes|nullable|string|max:2000']);

        $this->referrals->setAmount($bonus, array_key_exists('amount', $validated) && $validated['amount'] !== null ? (float) $validated['amount'] : null, $validated['notes'] ?? null);

        return $this->ok($bonus->fresh(['candidate:id,full_name', 'employee', 'agency:id,name']), 'Bonus updated');
    }

    public function approveBonus(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $bonus = $this->referrals->approve($this->bonus($request, $id), $request->user());

        return $this->ok($bonus->fresh(['candidate:id,full_name', 'employee', 'agency:id,name']), $bonus->bonus_id ? 'Approved. A payroll bonus was created.' : 'Approved');
    }

    public function payBonus(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $bonus = $this->referrals->markPaid($this->bonus($request, $id), $request->user());

        return $this->ok($bonus->fresh(['candidate:id,full_name', 'employee', 'agency:id,name']), 'Marked as paid');
    }

    public function cancelBonus(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $validated = $request->validate(['notes' => 'nullable|string|max:2000']);
        $bonus = $this->referrals->cancel($this->bonus($request, $id), $request->user(), $validated['notes'] ?? null);

        return $this->ok($bonus->fresh(['candidate:id,full_name', 'employee', 'agency:id,name']), 'Bonus cancelled');
    }

    // ---- employee self-service ----------------------------------------------------

    private function requireEmployee(Request $request)
    {
        $employee = $this->referrals->employeeFor($request->user());
        abort_unless($employee, 403, 'Only employees can refer candidates.');

        return $employee;
    }

    public function openJobs(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:refer');
        $this->requireEmployee($request);

        $jobs = JobOpening::query()
            ->where('status', 'open')
            ->with('department:id,name')
            ->orderBy('title')
            ->get(['id', 'title', 'department_id', 'location', 'employment_type', 'referral_bonus_amount', 'salary_currency'])
            ->map(fn (JobOpening $job) => [
                'id' => $job->id,
                'title' => $job->title,
                'department' => $job->department?->name,
                'location' => $job->location,
                'employment_type' => $job->employment_type,
                'bonus' => $job->referral_bonus_amount !== null ? (float) $job->referral_bonus_amount : null,
                'currency' => $job->salary_currency,
            ]);

        return $this->ok($jobs);
    }

    public function mine(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:refer');
        $employee = $this->requireEmployee($request);

        $this->referrals->refresh($request->user()->company_id);

        $rows = Candidate::query()
            ->where('referrer_employee_id', $employee->id)
            ->with(['jobOpening:id,title', 'referralBonus'])
            ->latest('id')
            ->get()
            ->map(fn (Candidate $candidate) => [
                'id' => $candidate->id,
                'name' => $candidate->full_name,
                'job_title' => $candidate->jobOpening?->title,
                'referred_on' => $candidate->created_at?->toDateString(),
                'status' => $this->referrals->statusLabel($candidate),
                'bonus_status' => $candidate->referralBonus?->status,
                'bonus_amount' => $candidate->referralBonus?->amount !== null ? (float) $candidate->referralBonus->amount : null,
                'bonus_currency' => $candidate->referralBonus?->currency,
                'bonus_eligible_on' => $candidate->referralBonus?->eligible_on?->toDateString(),
            ]);

        return $this->ok($rows);
    }

    public function submit(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:refer');
        $employee = $this->requireEmployee($request);

        $validated = $request->validate([
            'job_opening_id' => ['required', 'integer', Rule::exists('job_openings', 'id')->where('company_id', $request->user()->company_id)],
            'full_name' => 'required|string|max:255',
            'email' => 'required|email:rfc|max:255',
            'phone' => 'nullable|string|max:50',
            'note' => 'nullable|string|max:2000',
            'resume' => 'nullable|' . str_replace('required|', '', ResumeStorageService::VALIDATION_RULES),
        ]);

        $job = JobOpening::query()->findOrFail($validated['job_opening_id']);
        $candidate = $this->referrals->submit($request->user(), $employee, $job, $validated, $request->file('resume'));

        return $this->ok(['id' => $candidate->id], 'Thank you! Your referral has been submitted.', 201);
    }
}
