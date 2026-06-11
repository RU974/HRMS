<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\Interview;
use App\Models\Scopes\CompanyScope;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

abstract class AbstractInterviewController extends Controller
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

        $query = Interview::with('candidate')->orderBy('scheduled_at', 'desc');

        if ($request->filled('candidate_id')) {
            $query->where('candidate_id', $request->candidate_id);
        }

        if ($request->filled('result')) {
            $query->where('result', $request->result);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->q);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('interviewer_name', 'like', "%{$q}%")
                    ->orWhereHas('candidate', function ($candidateQuery) use ($q) {
                        $candidateQuery->where('full_name', 'like', "%{$q}%");
                    });
            });
        }

        return $this->ok($query->paginate((int) $request->input('per_page', 15)));
    }

    public function store(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:manage_settings', 'schedule interviews']);

        $validated = $request->validate([
            'candidate_id' => ['required', $this->validateCandidateBelongsToCompany($request)],
            'interviewer_name' => 'required|string|max:255',
            'interview_type' => 'nullable|in:screening,technical,behavioral,managerial,hr',
            'scheduled_at' => 'required|date',
            'result' => 'nullable|in:pending,pass,fail,hold',
            'feedback' => 'nullable|string',
        ]);

        $candidate = Candidate::withoutGlobalScope(CompanyScope::class)->findOrFail($validated['candidate_id']);

        $interview = Interview::create([
            ...$validated,
            'company_id' => $candidate->company_id ?? $request->user()?->company_id,
            'interview_type' => $validated['interview_type'] ?? 'technical',
            'result' => $validated['result'] ?? 'pending',
        ]);

        return $this->ok($interview->load('candidate'), 'Interview scheduled successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        return $this->ok($this->resolveTenantModel(Interview::class, $id)->load('candidate'));
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:manage_settings', 'schedule interviews']);

        $interview = $this->resolveTenantModel(Interview::class, $id);

        $validated = $request->validate([
            'candidate_id' => ['sometimes', $this->validateCandidateBelongsToCompany($request)],
            'interviewer_name' => 'sometimes|string|max:255',
            'interview_type' => 'sometimes|in:screening,technical,behavioral,managerial,hr',
            'scheduled_at' => 'sometimes|date',
            'result' => 'sometimes|in:pending,pass,fail,hold',
            'feedback' => 'sometimes|nullable|string',
        ]);

        $interview->update($validated);

        return $this->ok($interview->load('candidate'), 'Interview updated successfully');
    }

    public function destroy($id)
    {
        $this->authorizeAnyPermission(request(), ['recruitment:manage_settings', 'schedule interviews']);

        $this->resolveTenantModel(Interview::class, $id)->delete();

        return $this->ok(null, 'Interview deleted successfully');
    }
}
