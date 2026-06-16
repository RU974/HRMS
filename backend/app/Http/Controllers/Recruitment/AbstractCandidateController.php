<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Services\Recruitment\CandidateWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

abstract class AbstractCandidateController extends Controller
{
    use EnsuresCompanyIsolation;

    private function validateJobOpeningBelongsToCompany(Request $request, string $field = 'job_opening_id')
    {
        return Rule::exists('job_openings', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
        });
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $query = Candidate::with(['jobOpening', 'interviews', 'employee'])->latest();

        if ($request->filled('job_opening_id')) {
            $query->where('job_opening_id', $request->job_opening_id);
        }

        if ($request->filled('stage')) {
            $query->where('stage', $request->stage);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('source', 'like', "%{$q}%");
            });
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:create');

        $workflowService = app(CandidateWorkflowService::class);

        $validated = $request->validate([
            'job_opening_id' => ['required', $this->validateJobOpeningBelongsToCompany($request)],
            'full_name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:50',
            'resume_path' => 'nullable|string|max:1000',
            'source' => 'nullable|string|max:120',
            'stage' => 'nullable|in:applied,screening,interview,offer,hired,rejected',
            'rating' => 'nullable|integer|min:1|max:5',
            'status' => 'nullable|in:active,inactive',
            'applied_at' => 'nullable|date',
            'notes' => 'nullable|string',
            'offer_letter_data' => 'sometimes|nullable|array',
            'offer_letter_data.offer_date' => 'sometimes|nullable|date',
            'offer_letter_data.start_date' => 'sometimes|nullable|date',
            'offer_letter_data.salary' => 'sometimes|nullable|string|max:100',
            'offer_letter_data.currency' => 'sometimes|nullable|string|max:10',
            'offer_letter_data.benefits' => 'sometimes|nullable|array',
            'offer_letter_data.terms' => 'sometimes|nullable|string',
            'offer_letter_data.additional_notes' => 'sometimes|nullable|string',
            'onboarding_checklist' => 'sometimes|nullable|array',
            'onboarding_checklist.*.title' => 'required_with:onboarding_checklist|string|max:255',
            'onboarding_checklist.*.completed' => 'sometimes|boolean',
            'onboarding_checklist.*.notes' => 'sometimes|nullable|string',
        ]);

        if (isset($validated['stage'])) {
            $workflowService->assertValidTransition('applied', $validated['stage']);
        }

        if (array_key_exists('offer_letter_data', $validated)) {
            $validated['offer_letter_data'] = $workflowService->normalizeOfferLetterData($validated['offer_letter_data'] ?? []);
        }

        if (array_key_exists('onboarding_checklist', $validated)) {
            $validated['onboarding_checklist'] = $workflowService->normalizeChecklist($validated['onboarding_checklist'] ?? []);
        }

        $candidate = Candidate::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
            'stage' => $validated['stage'] ?? 'applied',
            'status' => $validated['status'] ?? 'active',
        ]);

        if ($candidate->stage === 'hired') {
            $workflowService->convertToEmployee($candidate, $request->user()?->company_id);
        }

        return $this->ok($candidate->load(['jobOpening', 'employee']), 'Candidate created successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        return $this->ok($this->resolveTenantModel(Candidate::class, $id)->load(['jobOpening', 'interviews', 'employee']));
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        $workflowService = app(CandidateWorkflowService::class);

        $validated = $request->validate([
            'job_opening_id' => ['sometimes', $this->validateJobOpeningBelongsToCompany($request)],
            'full_name' => 'sometimes|string|max:255',
            'email' => 'sometimes|email|max:255',
            'phone' => 'sometimes|nullable|string|max:50',
            'resume_path' => 'sometimes|nullable|string|max:1000',
            'source' => 'sometimes|nullable|string|max:120',
            'stage' => 'sometimes|in:applied,screening,interview,offer,hired,rejected',
            'rating' => 'sometimes|nullable|integer|min:1|max:5',
            'status' => 'sometimes|in:active,inactive',
            'applied_at' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string',
            'offer_letter_data' => 'sometimes|nullable|array',
            'offer_letter_data.offer_date' => 'sometimes|nullable|date',
            'offer_letter_data.start_date' => 'sometimes|nullable|date',
            'offer_letter_data.salary' => 'sometimes|nullable|string|max:100',
            'offer_letter_data.currency' => 'sometimes|nullable|string|max:10',
            'offer_letter_data.benefits' => 'sometimes|nullable|array',
            'offer_letter_data.terms' => 'sometimes|nullable|string',
            'offer_letter_data.additional_notes' => 'sometimes|nullable|string',
            'onboarding_checklist' => 'sometimes|nullable|array',
            'onboarding_checklist.*.title' => 'required_with:onboarding_checklist|string|max:255',
            'onboarding_checklist.*.completed' => 'sometimes|boolean',
            'onboarding_checklist.*.notes' => 'sometimes|nullable|string',
        ]);

        if (isset($validated['stage'])) {
            $workflowService->assertValidTransition($candidate->stage, $validated['stage']);
        }

        if (array_key_exists('offer_letter_data', $validated)) {
            $validated['offer_letter_data'] = $workflowService->normalizeOfferLetterData($validated['offer_letter_data'] ?? []);
        }

        if (array_key_exists('onboarding_checklist', $validated)) {
            $validated['onboarding_checklist'] = $workflowService->normalizeChecklist($validated['onboarding_checklist'] ?? []);
        }

        $candidate->update($validated);

        if ($candidate->stage === 'hired') {
            $workflowService->convertToEmployee($candidate, $request->user()?->company_id);
        }

        return $this->ok($candidate->load(['jobOpening', 'interviews', 'employee']), 'Candidate updated successfully');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:create');

        $this->resolveTenantModel(Candidate::class, $id)->delete();

        return $this->ok(null, 'Candidate deleted successfully');
    }

    public function pipelineSummary()
    {
        $this->authorizePermission(request(), 'recruitment:view');

        $summary = Candidate::query()
            ->selectRaw('stage, COUNT(*) as count')
            ->groupBy('stage')
            ->orderByRaw("CASE stage
                WHEN 'applied' THEN 1
                WHEN 'screening' THEN 2
                WHEN 'interview' THEN 3
                WHEN 'offer' THEN 4
                WHEN 'hired' THEN 5
                WHEN 'rejected' THEN 6
                ELSE 7
            END")
            ->get();

        return $this->ok($summary);
    }
}