<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

abstract class AbstractOnboardingController extends Controller
{
    use EnsuresCompanyIsolation;

    private function validateCandidateBelongsToCompany(Request $request, string $field = 'candidate_id')
    {
        return Rule::exists('candidates', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
        });
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $query = Candidate::with(['jobOpening', 'interviews', 'employee'])
            ->withCount([
                'onboardingTasks as tasks_total',
                'onboardingTasks as tasks_done' => fn ($query) => $query->whereIn('status', ['completed', 'skipped']),
            ])
            ->where('stage', 'hired')
            ->latest('id');

        if ($request->filled('onboarding_status')) {
            $query->where('onboarding_status', $request->onboarding_status);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%");
            });
        }

        $perPage = min(max((int) $request->input('per_page', 15), 1), 100);

        return $this->ok($query->paginate($perPage));
    }

    public function store(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $validated = $request->validate([
            'candidate_id' => ['required', $this->validateCandidateBelongsToCompany($request)],
            'onboarding_status' => 'required|in:pending,in_progress,completed,deferred',
            'onboarding_start_date' => 'nullable|date',
            'onboarding_notes' => 'nullable|string',
        ]);

        $candidate = $this->resolveTenantModel(Candidate::class, $validated['candidate_id']);

        if ($candidate->stage !== 'hired') {
            throw ValidationException::withMessages([
                'candidate_id' => ['Only hired candidates can be onboarded. Hire the candidate first.'],
            ]);
        }

        $candidate->update([
            'onboarding_status' => $validated['onboarding_status'],
            'onboarding_start_date' => $validated['onboarding_start_date'] ?? null,
            'onboarding_notes' => $validated['onboarding_notes'] ?? null,
        ]);

        return $this->ok($candidate->load(['jobOpening', 'interviews', 'employee']), 'Onboarding created successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        return $this->ok($this->resolveTenantModel(Candidate::class, $id)->load(['jobOpening', 'interviews', 'employee', 'onboardingTasks.assignee']));
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        if ($candidate->stage !== 'hired') {
            throw ValidationException::withMessages([
                'candidate_id' => ['Only hired candidates can be onboarded. Hire the candidate first.'],
            ]);
        }

        $validated = $request->validate([
            'onboarding_status' => 'sometimes|in:pending,in_progress,completed,deferred',
            'onboarding_start_date' => 'sometimes|nullable|date',
            'onboarding_notes' => 'sometimes|nullable|string',
        ]);

        $candidate->update($validated);

        return $this->ok($candidate->load(['jobOpening', 'interviews', 'employee']), 'Onboarding updated successfully');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:delete');

        // The employee record is created at hire time, so clearing onboarding data would
        // leave a hired candidate without a trace of the process. Update the status instead.
        return $this->fail('Onboarding records cannot be deleted. Set the status to deferred or completed instead.', 422);
    }
}
