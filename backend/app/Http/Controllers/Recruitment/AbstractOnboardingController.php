<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Services\Recruitment\CandidateWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

        $query = Candidate::with(['jobOpening', 'employee'])
            ->where('stage', 'hired')
            ->latest();

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

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:manage_settings');

        $workflowService = app(CandidateWorkflowService::class);

        $validated = $request->validate([
            'candidate_id' => ['required', $this->validateCandidateBelongsToCompany($request)],
            'onboarding_status' => 'required|in:pending,in_progress,completed,deferred',
            'onboarding_start_date' => 'nullable|date',
            'onboarding_notes' => 'nullable|string',
            'onboarding_checklist' => 'sometimes|nullable|array',
            'onboarding_checklist.*.title' => 'required_with:onboarding_checklist|string|max:255',
            'onboarding_checklist.*.completed' => 'sometimes|boolean',
            'onboarding_checklist.*.notes' => 'sometimes|nullable|string',
        ]);

        $candidate = Candidate::findOrFail($validated['candidate_id']);

        if (array_key_exists('onboarding_checklist', $validated)) {
            $validated['onboarding_checklist'] = $workflowService->normalizeChecklist($validated['onboarding_checklist'] ?? []);
        }

        $candidate->update([
            'stage' => 'hired',
            'onboarding_status' => $validated['onboarding_status'],
            'onboarding_start_date' => $validated['onboarding_start_date'] ?? null,
            'onboarding_notes' => $validated['onboarding_notes'] ?? null,
            'onboarding_checklist' => $validated['onboarding_checklist'] ?? $candidate->onboarding_checklist,
        ]);

        $workflowService->convertToEmployee($candidate, $request->user()?->company_id);

        return $this->ok($candidate->load(['jobOpening', 'employee']), 'Onboarding created successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        return $this->ok($this->resolveTenantModel(Candidate::class, $id)->load(['jobOpening', 'employee']));
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:manage_settings', 'edit recruitment']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        $workflowService = app(CandidateWorkflowService::class);

        $validated = $request->validate([
            'onboarding_status' => 'sometimes|in:pending,in_progress,completed,deferred',
            'onboarding_start_date' => 'sometimes|nullable|date',
            'onboarding_notes' => 'sometimes|nullable|string',
            'onboarding_checklist' => 'sometimes|nullable|array',
            'onboarding_checklist.*.title' => 'required_with:onboarding_checklist|string|max:255',
            'onboarding_checklist.*.completed' => 'sometimes|boolean',
            'onboarding_checklist.*.notes' => 'sometimes|nullable|string',
        ]);

        if (array_key_exists('onboarding_checklist', $validated)) {
            $validated['onboarding_checklist'] = $workflowService->normalizeChecklist($validated['onboarding_checklist'] ?? []);
        }

        $candidate->update([
            ...$validated,
            'stage' => 'hired',
        ]);

        $workflowService->convertToEmployee($candidate, $request->user()?->company_id);

        return $this->ok($candidate->load(['jobOpening', 'employee']), 'Onboarding updated successfully');
    }

    public function destroy($id)
    {
        $this->authorizeAnyPermission(request(), ['recruitment:manage_settings', 'edit recruitment']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $candidate->update([
            'onboarding_status' => null,
            'onboarding_start_date' => null,
            'onboarding_notes' => null,
            'onboarding_checklist' => null,
        ]);

        return $this->ok($candidate->load('jobOpening'), 'Onboarding deleted successfully');
    }
}
