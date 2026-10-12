<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\JobOpening;
use App\Models\PipelineStage;
use App\Services\Recruitment\PipelineService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Pipeline stages per job, or the company default when no job is given. Changing the company default
 * needs recruitment settings access; a single job's pipeline can be edited by anyone who edits jobs.
 */
class PipelineController extends Controller
{
    use EnsuresCompanyIsolation;

    public function __construct(private readonly PipelineService $pipelines)
    {
    }

    private function job(Request $request): ?JobOpening
    {
        $jobId = $request->input('job_opening_id');

        return filled($jobId) ? $this->resolveTenantModel(JobOpening::class, $jobId) : null;
    }

    private function payload(Request $request, ?JobOpening $job)
    {
        $companyId = $request->user()?->company_id;
        $resolved = $this->pipelines->resolve($companyId, $job?->id);

        return [
            'scope' => $resolved['scope'],
            'job_opening_id' => $job?->id,
            'stages' => $resolved['stages']->values(),
            'categories' => PipelineStage::CATEGORIES,
            'candidate_counts' => $this->counts($resolved['stages'], $job),
        ];
    }

    /** @return array<int, int> number of candidates in each stage (by position), so the editor can warn before removal */
    private function counts($stages, ?JobOpening $job): array
    {
        if ($job === null) {
            return [];
        }

        $counts = [];
        foreach ($stages as $index => $stage) {
            $query = Candidate::query()->where('job_opening_id', $job->id);
            $counts[$index] = $this->pipelines->scopeToStage($query, $stages, $index)->count();
        }

        return $counts;
    }

    public function show(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');
        $request->validate(['job_opening_id' => 'nullable|integer']);

        return $this->ok($this->payload($request, $this->job($request)));
    }

    public function save(Request $request)
    {
        $validated = $request->validate([
            'job_opening_id' => 'nullable|integer',
            'stages' => 'required|array|min:4|max:15',
            'stages.*.id' => 'nullable|integer',
            'stages.*.name' => 'required|string|max:80',
            'stages.*.category' => ['required', Rule::in(PipelineStage::CATEGORIES)],
            'stages.*.is_skippable' => 'sometimes|boolean',
        ]);

        $job = $this->job($request);
        $this->authorizePermission($request, $job ? 'recruitment:edit' : 'recruitment:manage_settings');

        $this->pipelines->save($request->user()?->company_id, $job?->id, $validated['stages']);

        return $this->ok($this->payload($request, $job), 'Pipeline saved');
    }

    public function reset(Request $request)
    {
        $request->validate(['job_opening_id' => 'nullable|integer']);
        $job = $this->job($request);
        $this->authorizePermission($request, $job ? 'recruitment:edit' : 'recruitment:manage_settings');

        $this->pipelines->reset($request->user()?->company_id, $job?->id);

        return $this->ok($this->payload($request, $job), $job ? 'This job now uses the default pipeline' : 'Default pipeline restored');
    }
}
