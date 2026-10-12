<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\Candidate;
use App\Models\CandidateNote;
use App\Models\InterviewRescheduleRequest;
use App\Models\JobOpening;
use App\Services\Recruitment\CandidateFilter;
use App\Services\Recruitment\CandidateMessageService;
use App\Services\Recruitment\CandidateRetentionService;
use App\Services\Recruitment\CandidateCheckService;
use App\Services\Recruitment\DuplicateMergeService;
use App\Services\Recruitment\PipelineService;
use App\Services\Recruitment\ReferralService;
use App\Services\Recruitment\InterviewRescheduleService;
use App\Services\Recruitment\CandidateWorkflowService;
use App\Services\Recruitment\CandidatePortalService;
use App\Services\Recruitment\DuplicateCandidateService;
use App\Services\Recruitment\ResumeParserService;
use App\Services\Recruitment\TalentPoolService;
use App\Services\Recruitment\RecruitmentNotificationService;
use App\Services\Recruitment\ResumeStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

abstract class AbstractCandidateController extends Controller
{
    use EnsuresCompanyIsolation;

    private const DETAIL_RELATIONS = ['jobOpening', 'interviews', 'employee'];

    /** Everything the candidate detail page needs in one response. */
    private const SHOW_RELATIONS = ['jobOpening', 'interviews.scorecards.submitter', 'employee', 'stageHistories.changedBy', 'candidateNotes.author', 'offers.creator', 'documents', 'answers', 'checks', 'referrer', 'agency', 'referralBonus'];

    /** Everything the detail page shows, plus the pipeline the candidate moves through and the state of required checks. */
    private function present(Candidate $candidate): Candidate
    {
        $candidate->load(self::SHOW_RELATIONS);
        $candidate->setAttribute('pipeline', app(CandidateWorkflowService::class)->pipelineFor($candidate));
        $candidate->setAttribute('check_summary', app(CandidateCheckService::class)->summary($candidate));

        return $candidate;
    }

    /** Validation for who supplied a candidate; the free-text source stays as it was typed. */
    private function sourceRules(Request $request): array
    {
        $company = $request->user()?->company_id;

        return [
            'source_type' => ['sometimes', 'nullable', Rule::in(Candidate::SOURCE_TYPES)],
            'referrer_employee_id' => ['sometimes', 'nullable', 'integer', Rule::exists('employees', 'id')->where('company_id', $company)],
            'agency_id' => ['sometimes', 'nullable', 'integer', Rule::exists('recruitment_agencies', 'id')->where('company_id', $company)],
        ];
    }

    private function validateJobOpeningBelongsToCompany(Request $request, string $field = 'job_opening_id')
    {
        return Rule::exists('job_openings', 'id')->where(function ($query) use ($request) {
            if ($request->user()?->company_id) {
                $query->where('company_id', $request->user()->company_id);
            }
        });
    }

    private function assertJobAcceptsCandidates(int|string $jobOpeningId): void
    {
        $job = JobOpening::query()->find($jobOpeningId);

        if (! $job || $job->status !== 'open') {
            throw ValidationException::withMessages([
                'job_opening_id' => ['This job opening is not open for new candidates.'],
            ]);
        }
    }

    private function assertNotDuplicate(string $email, int|string $jobOpeningId, ?int $ignoreCandidateId = null): void
    {
        $exists = Candidate::query()
            ->where('job_opening_id', $jobOpeningId)
            ->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($email))])
            ->when($ignoreCandidateId, fn ($query) => $query->where('id', '!=', $ignoreCandidateId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'email' => ['A candidate with this email has already applied for this job.'],
            ]);
        }
    }

    /** @return array<int, string> */
    protected function keywords(mixed $input): array
    {
        return app(CandidateFilter::class)->keywords($input);
    }

    /** A short excerpt of the resume around the first matching keyword. */
    protected function snippet(?string $text, array $keywords): ?string
    {
        if (! $text || ! $keywords) {
            return null;
        }

        foreach ($keywords as $keyword) {
            $position = mb_stripos($text, $keyword);

            if ($position !== false) {
                $start = max(0, $position - 60);
                $excerpt = mb_substr($text, $start, 160);

                return ($start > 0 ? '…' : '') . trim(preg_replace('/\s+/', ' ', $excerpt) ?? $excerpt) . '…';
            }
        }

        return null;
    }

    private function applyFilters($query, Request $request, array $except = [])
    {
        return app(CandidateFilter::class)->apply($query, $request->all(), $except);
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $query = $this->applyFilters(Candidate::with(['jobOpening', 'interviews', 'employee']), $request);
        app(CandidateFilter::class)->sort($query, $request->input('sort'));

        $perPage = min(max((int) $request->input('per_page', 15), 1), 100);
        $page = $query->paginate($perPage);

        // Flag people who applied more than once and show where a resume search matched.
        $duplicateCounts = app(DuplicateCandidateService::class)->countsFor($page->getCollection());
        $keywords = $this->keywords($request->input('resume_q'));

        $page->getCollection()->each(function (Candidate $candidate) use ($duplicateCounts, $keywords) {
            $candidate->setAttribute('duplicate_count', $duplicateCounts[$candidate->id] ?? 0);

            if ($keywords) {
                $candidate->setAttribute('resume_snippet', $this->snippet($candidate->resume_text, $keywords));
            }
        });

        return $this->ok($page);
    }

    /**
     * Kanban data: for each stage the total count plus the most recent candidates.
     */
    public function board(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $limit = min(max((int) $request->input('limit', 30), 1), 100);
        $base = fn () => $this->applyFilters(Candidate::query(), $request, ['stage']);

        $sort = $request->input('sort');

        // One job selected: show its own pipeline. Otherwise every job shares the built-in columns.
        $pipeline = app(PipelineService::class);
        $jobId = $request->filled('job_opening_id') ? (int) $request->input('job_opening_id') : null;
        $custom = $jobId ? $pipeline->stagesFor($request->user()?->company_id, $jobId) : $pipeline->builtIn();
        $columns = $custom->values()->map(fn (array $stage, int $index) => $stage + ['index' => $index])
            ->concat(collect(['hired', 'rejected'])->map(fn (string $name) => ['id' => null, 'name' => ucfirst($name), 'category' => $name, 'is_skippable' => false, 'sort_order' => 99, 'index' => null]));

        $stages = $columns->map(function (array $column) use ($base, $limit, $sort, $custom, $pipeline) {
            $stage = $column['category'];
            $scope = fn () => $column['index'] === null ? $base()->where('stage', $stage) : $pipeline->scopeToStage($base(), $custom, $column['index']);
            $count = $scope()->count();

            $candidates = $scope()
                ->with('jobOpening:id,title')
                ->tap(fn ($query) => app(CandidateFilter::class)->sort($query, $sort))
                ->limit($limit)
                ->get()
                ->map(fn (Candidate $candidate) => [
                    'id' => $candidate->id,
                    'full_name' => $candidate->full_name,
                    'email' => $candidate->email,
                    'stage' => $candidate->stage,
                    'status' => $candidate->status,
                    'rating' => $candidate->rating,
                    'fit_score' => $candidate->fit_score,
                    'source' => $candidate->source,
                    'tags' => $candidate->tags ?? [],
                    'applied_at' => $candidate->applied_at?->toDateString(),
                    'has_resume' => $candidate->has_resume,
                    'job_opening_id' => $candidate->job_opening_id,
                    'job_title' => $candidate->jobOpening?->title,
                    'knockout_failed' => (bool) $candidate->knockout_failed,
                ])
                ->values();

            return [
                'stage' => $stage,
                'pipeline_stage_id' => $column['id'],
                'name' => $column['name'],
                'count' => $count,
                'candidates' => $candidates,
            ];
        })->values();

        return $this->ok(['stages' => $stages, 'limit' => $limit]);
    }

    public function stats(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $query = Candidate::query();

        if ($request->filled('job_opening_id')) {
            $query->where('job_opening_id', $request->job_opening_id);
        }

        $stageCounts = (clone $query)
            ->selectRaw('stage, COUNT(*) as count')
            ->groupBy('stage')
            ->pluck('count', 'stage');

        return $this->ok([
            'total' => (clone $query)->count(),
            'active' => (clone $query)->where('status', 'active')->count(),
            'hired' => (int) ($stageCounts['hired'] ?? 0),
            'interview' => (int) ($stageCounts['interview'] ?? 0),
            'offer' => (int) ($stageCounts['offer'] ?? 0),
            'rejected' => (int) ($stageCounts['rejected'] ?? 0),
        ]);
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
            'source' => 'nullable|string|max:120',
            'stage' => 'nullable|in:applied,screening,interview,offer,hired,rejected',
            'rating' => 'nullable|integer|min:1|max:5',
            'status' => 'nullable|in:active,inactive',
            'applied_at' => 'nullable|date',
            'notes' => 'nullable|string',
            'tags' => 'sometimes|nullable|array|max:20',
            'tags.*' => 'string|max:40',
        ] + $this->sourceRules($request));

        $referrals = app(ReferralService::class);
        $validated = array_merge($validated, $referrals->normaliseSource($validated, $request->user()?->company_id));

        if (isset($validated['stage'])) {
            $workflowService->assertValidTransition('applied', $validated['stage']);

            if ($validated['stage'] === 'rejected') {
                throw ValidationException::withMessages(['stage' => ['A new candidate cannot start as rejected.']]);
            }
        }

        $this->assertJobAcceptsCandidates($validated['job_opening_id']);
        $this->assertNotDuplicate($validated['email'], $validated['job_opening_id']);

        if (array_key_exists('tags', $validated)) {
            $validated['tags'] = array_values(array_unique(array_map('trim', $validated['tags'] ?? [])));
        }

        $candidate = DB::transaction(function () use ($validated, $request, $workflowService, $referrals) {
            $candidate = Candidate::create([
                ...$validated,
                'company_id' => $request->user()?->company_id,
                'stage' => $validated['stage'] ?? 'applied',
                'status' => $validated['status'] ?? 'active',
                'applied_at' => $validated['applied_at'] ?? now()->toDateString(),
            ]);

            $workflowService->recordStage($candidate, null, $candidate->stage, $request->user()?->id);

            if (! filled($candidate->source) && ($label = $referrals->sourceLabel($candidate))) {
                $candidate->update(['source' => $label]);
            }
            $referrals->sync($candidate);

            return $candidate;
        });

        app(RecruitmentNotificationService::class)->candidateAdded($candidate, $request->user()?->id);

        $candidate->load(self::DETAIL_RELATIONS)->setAttribute('duplicates', app(DuplicateCandidateService::class)->matchesFor($candidate));

        return $this->ok($candidate, 'Candidate created successfully', 201);
    }

    public function show($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        $candidate = $this->present($this->resolveTenantModel(Candidate::class, $id));
        $candidate->setAttribute('duplicates', app(DuplicateCandidateService::class)->matchesFor($candidate));
        $candidate->setAttribute('pending_reschedule_requests', InterviewRescheduleRequest::query()->where('candidate_id', $candidate->id)->where('status', 'pending')->with('interview')->get());
        $candidate->setAttribute('unread_messages', $candidate->messages()->where('direction', 'candidate')->whereNull('read_at')->count());

        return $this->ok($candidate);
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
            'source' => 'sometimes|nullable|string|max:120',
            'stage' => 'sometimes|in:applied,screening,interview,offer,hired,rejected',
            'rejection_reason' => 'sometimes|nullable|string|max:1000',
            'talent_pool' => 'sometimes|nullable|in:silver_medalist,general',
            'rating' => 'sometimes|nullable|integer|min:1|max:5',
            'status' => 'sometimes|in:active,inactive',
            'applied_at' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string',
            'tags' => 'sometimes|nullable|array|max:20',
            'tags.*' => 'string|max:40',
            'pipeline_stage_id' => 'sometimes|nullable|integer',
        ] + $this->sourceRules($request));

        $targetStage = Arr::pull($validated, 'stage');
        $targetPipelineStage = Arr::pull($validated, 'pipeline_stage_id');

        // A custom stage names its own category, so naming just the stage is enough.
        if ($targetPipelineStage !== null && $targetStage === null) {
            $targetStage = $this->categoryOfPipelineStage($candidate, (int) $targetPipelineStage);
        }

        $sourceTouched = array_key_exists('source_type', $validated) || array_key_exists('referrer_employee_id', $validated) || array_key_exists('agency_id', $validated);
        if ($sourceTouched) {
            $validated = array_merge($validated, app(ReferralService::class)->normaliseSource([
                'source_type' => $validated['source_type'] ?? $candidate->source_type,
                'referrer_employee_id' => array_key_exists('referrer_employee_id', $validated) ? $validated['referrer_employee_id'] : $candidate->referrer_employee_id,
                'agency_id' => array_key_exists('agency_id', $validated) ? $validated['agency_id'] : $candidate->agency_id,
            ], $request->user()?->company_id));
        }
        $reason = Arr::pull($validated, 'rejection_reason');
        $pool = Arr::pull($validated, 'talent_pool');

        if ($targetStage !== null && ($targetStage !== $candidate->stage || $targetPipelineStage !== null)) {
            $workflowService->assertCanMove($candidate, $targetStage, $targetPipelineStage === null ? null : (int) $targetPipelineStage);

            if ($workflowService->isReopen($candidate->stage, $targetStage)) {
                $this->authorizePermission($request, 'recruitment:edit', 'You are not authorized to reopen a rejected candidate.');
            }

            if ($targetStage === 'rejected' && ! filled($reason)) {
                throw ValidationException::withMessages(['rejection_reason' => ['A rejection reason is required.']]);
            }
        }

        $jobChanged = isset($validated['job_opening_id']) && (int) $validated['job_opening_id'] !== (int) $candidate->job_opening_id;
        $emailChanged = isset($validated['email']) && mb_strtolower(trim($validated['email'])) !== mb_strtolower(trim($candidate->email));

        if ($jobChanged) {
            $this->assertJobAcceptsCandidates($validated['job_opening_id']);
        }

        if ($jobChanged || $emailChanged) {
            $this->assertNotDuplicate(
                $validated['email'] ?? $candidate->email,
                $validated['job_opening_id'] ?? $candidate->job_opening_id,
                $candidate->id
            );
        }

        if (array_key_exists('tags', $validated)) {
            $validated['tags'] = array_values(array_unique(array_map('trim', $validated['tags'] ?? [])));
        }

        $previousStage = $candidate->stage;

        DB::transaction(function () use ($candidate, $validated, $targetStage, $targetPipelineStage, $reason, $pool, $workflowService, $request, $jobChanged, $sourceTouched) {
            // Another job has its own pipeline, so the old stage id no longer applies.
            $candidate->update($validated + ($jobChanged ? ['pipeline_stage_id' => null] : []));

            if ($targetStage !== null) {
                $workflowService->changeStage($candidate, $targetStage, $request->user()?->id, $reason, $targetPipelineStage === null ? null : (int) $targetPipelineStage);
            }

            if ($sourceTouched) {
                $referrals = app(ReferralService::class);
                if (! filled($candidate->source) && ($label = $referrals->sourceLabel($candidate))) {
                    $candidate->update(['source' => $label]);
                }
                $referrals->sync($candidate);
            }

            if ($pool !== null && $candidate->stage === 'rejected') {
                app(TalentPoolService::class)->add($candidate, $pool);
            }
        });

        if ($candidate->stage !== $previousStage) {
            app(RecruitmentNotificationService::class)->stageChanged($candidate, $previousStage, $request->user()?->id);
        }

        return $this->ok($this->present($candidate), 'Candidate updated successfully');
    }

    public function changeStage(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $workflowService = app(CandidateWorkflowService::class);

        $validated = $request->validate([
            'stage' => 'required_without:pipeline_stage_id|in:applied,screening,interview,offer,hired,rejected',
            'pipeline_stage_id' => 'nullable|integer',
            'reason' => 'nullable|string|max:1000',
            'talent_pool' => 'nullable|in:silver_medalist,general',
        ]);

        $pipelineStageId = isset($validated['pipeline_stage_id']) ? (int) $validated['pipeline_stage_id'] : null;
        $validated['stage'] ??= $this->categoryOfPipelineStage($candidate, $pipelineStageId);

        $previousStage = $candidate->stage;

        $workflowService->assertCanMove($candidate, $validated['stage'], $pipelineStageId);

        if ($workflowService->isReopen($candidate->stage, $validated['stage'])) {
            $this->authorizePermission($request, 'recruitment:edit', 'You are not authorized to reopen a rejected candidate.');
        }

        DB::transaction(function () use ($workflowService, $candidate, $validated, $request, $pipelineStageId) {
            $workflowService->changeStage($candidate, $validated['stage'], $request->user()?->id, $validated['reason'] ?? null, $pipelineStageId);

            // Keeping a rejected candidate for later is decided at the moment of rejection.
            if (! empty($validated['talent_pool']) && $candidate->stage === 'rejected') {
                app(TalentPoolService::class)->add($candidate, $validated['talent_pool']);
            }
        });

        if ($candidate->stage !== $previousStage) {
            app(RecruitmentNotificationService::class)->stageChanged($candidate, $previousStage, $request->user()?->id);
        }

        return $this->ok(
            $this->present($candidate),
            'Candidate stage updated'
        );
    }

    private function categoryOfPipelineStage(Candidate $candidate, int $pipelineStageId): string
    {
        $stage = app(PipelineService::class)->forCandidate($candidate)->first(fn (array $stage) => $stage['id'] === $pipelineStageId);

        if (! $stage) {
            throw ValidationException::withMessages(['pipeline_stage_id' => ["That stage does not belong to this job's pipeline."]]);
        }

        return $stage['category'];
    }

    public function hire(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:edit');

        $candidate = $this->resolveTenantModel(Candidate::class, $id)->load('jobOpening');

        $validated = $request->validate([
            'salary' => 'nullable|numeric|min:0',
            'joining_date' => 'nullable|date',
            'template_id' => 'nullable|integer',
            'skip_offer' => 'sometimes|boolean',
        ]);

        $options = array_filter($validated, fn ($value) => $value !== null);

        if (! empty($options['skip_offer'])) {
            $this->authorizePermission($request, 'recruitment:manage_settings', 'Only users who manage recruitment settings can hire without an accepted offer.');
        }

        $result = app(CandidateWorkflowService::class)->hire($candidate, $options, $request->user()?->id);

        app(RecruitmentNotificationService::class)->candidateHired($candidate->fresh(), $request->user()?->id);

        return $this->ok([
            'candidate' => $candidate->fresh()->load(self::DETAIL_RELATIONS),
            'employee' => $result['employee'],
            'temp_password' => $result['temp_password'],
        ], 'Candidate hired successfully');
    }

    public function destroy($id)
    {
        $this->authorizePermission(request(), 'recruitment:delete');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        if ($candidate->stage === 'hired' || $candidate->employee_id) {
            return $this->fail('A hired candidate cannot be deleted because an employee record exists.', 422);
        }

        app(ResumeStorageService::class)->delete($candidate);
        $candidate->delete();

        return $this->ok(null, 'Candidate deleted successfully');
    }

    // ---- resume ----------------------------------------------------------------

    public function uploadResume(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        $request->validate(['resume' => ResumeStorageService::VALIDATION_RULES]);

        app(ResumeStorageService::class)->store($candidate, $request->file('resume'));

        return $this->ok($candidate->fresh()->load(self::DETAIL_RELATIONS), 'Resume uploaded successfully');
    }

    public function downloadResume(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        return app(ResumeStorageService::class)->respond($candidate, $request->boolean('download'));
    }

    public function deleteResume(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        app(ResumeStorageService::class)->delete($candidate);

        return $this->ok($candidate->fresh()->load(self::DETAIL_RELATIONS), 'Resume removed');
    }

    /** Read an uploaded CV and return what was found, without storing anything (used to prefill the add form). */
    public function parseResume(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $request->validate(['resume' => ResumeStorageService::VALIDATION_RULES]);

        $file = $request->file('resume');
        $parsed = app(ResumeParserService::class)->parseFile($file->getRealPath(), $file->getClientOriginalExtension());
        unset($parsed['text']);

        return $this->ok($parsed, empty(array_filter($parsed)) ? 'No details could be read from this file.' : 'Resume read');
    }

    public function reparseResume(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        if (! app(ResumeParserService::class)->parseStored($candidate)) {
            return $this->fail('No resume on file for this candidate.', 422);
        }

        return $this->ok($candidate->fresh()->load(self::DETAIL_RELATIONS), 'Resume parsed again');
    }

    // ---- candidate portal --------------------------------------------------------

    /** Issue (or rotate) the private link a candidate uses to follow their application. */
    public function portalLink(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        return $this->ok(app(CandidatePortalService::class)->issueLink($candidate), 'Portal link created');
    }

    // ---- talent pool ---------------------------------------------------------------

    public function addToTalentPool(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate([
            'pool' => 'required|in:silver_medalist,general',
            'note' => 'nullable|string|max:1000',
        ]);

        app(TalentPoolService::class)->add($candidate, $validated['pool'], $validated['note'] ?? null);

        return $this->ok($candidate->fresh()->load(self::DETAIL_RELATIONS), 'Added to the talent pool');
    }

    public function removeFromTalentPool(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        app(TalentPoolService::class)->remove($candidate);

        return $this->ok($candidate->fresh()->load(self::DETAIL_RELATIONS), 'Removed from the talent pool');
    }

    /** Put a talent-pool candidate forward for another opening as a fresh application. */
    public function considerForJob(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:create');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate(['job_opening_id' => ['required', $this->validateJobOpeningBelongsToCompany($request)]]);
        $job = $this->resolveTenantModel(JobOpening::class, $validated['job_opening_id']);

        $copy = app(TalentPoolService::class)->reapply($candidate, $job, $request->user());
        app(RecruitmentNotificationService::class)->candidateAdded($copy->load('jobOpening'), $request->user()?->id);

        return $this->ok($copy->load(self::DETAIL_RELATIONS), 'Candidate put forward for ' . $job->title, 201);
    }

    /** Ask a talent-pool candidate whether they are happy to stay on file; they answer from their portal page. */
    public function requestPoolConsent(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        if (! $candidate->talent_pool) {
            return $this->fail('Only candidates in the talent pool can be asked to stay on file.', 422);
        }

        if ($candidate->pool_consent === 'declined') {
            return $this->fail('This candidate already asked not to be kept on file.', 422);
        }

        $sent = app(CandidatePortalService::class)->sendLink(
            $candidate,
            'May we keep your details on file?',
            'We would like to keep your details on file so we can contact you about future roles at {{company}}. You can say yes or no on your private candidate page, and you can change your mind at any time.'
        );

        app(TalentPoolService::class)->markConsentRequested($candidate);

        return $this->ok($candidate->fresh()->load(self::DETAIL_RELATIONS), $sent ? 'Consent request sent' : 'Consent request saved, but the email could not be sent');
    }

    // ---- duplicates, erasure -----------------------------------------------------

    /** Fold duplicate applications of the same person into this record. */
    public function merge(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:delete');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $validated = $request->validate(['merge_ids' => 'required|array|min:1|max:20', 'merge_ids.*' => 'integer']);

        $merged = app(DuplicateMergeService::class)->merge($candidate, $validated['merge_ids'], $request->user());

        $merged->load(self::SHOW_RELATIONS)->setAttribute('duplicates', app(DuplicateCandidateService::class)->matchesFor($merged));

        return $this->ok($merged, 'Applications merged');
    }

    /** Erase everything that identifies a candidate (on their request, or when the record is no longer needed). */
    public function erase(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:delete');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $erased = app(CandidateRetentionService::class)->anonymize($candidate);

        return $this->ok($erased->load(self::DETAIL_RELATIONS), 'Candidate data erased');
    }

    // ---- messages, reschedule requests ---------------------------------------------

    public function messages(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $service = app(CandidateMessageService::class);
        $thread = $service->thread($candidate);
        $service->markReadByStaff($candidate);

        return $this->ok($thread);
    }

    public function sendMessage(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        if ($candidate->anonymized_at) {
            return $this->fail('This candidate\'s data was erased.', 422);
        }

        $validated = $request->validate(['body' => 'required|string|max:5000']);
        $message = app(CandidateMessageService::class)->fromStaff($candidate, $request->user(), $validated['body']);

        return $this->ok($message->load('author'), 'Message sent', 201);
    }

    public function rescheduleRequests(Request $request, $id)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        return $this->ok(InterviewRescheduleRequest::query()->where('candidate_id', $candidate->id)->with('interview')->latest('id')->get());
    }

    public function declineReschedule(Request $request, $requestId)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $record = $this->resolveTenantModel(InterviewRescheduleRequest::class, $requestId);
        $validated = $request->validate(['note' => 'nullable|string|max:1000']);

        return $this->ok(app(InterviewRescheduleService::class)->decline($record, $request->user(), $validated['note'] ?? null), 'Request declined');
    }

    // ---- notes -----------------------------------------------------------------

    public function notes($id)
    {
        $this->authorizePermission(request(), 'recruitment:view');

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        return $this->ok($candidate->candidateNotes()->with('author')->get());
    }

    public function addNote(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);

        $validated = $request->validate(['body' => 'required|string|max:5000']);

        $note = CandidateNote::create([
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'user_id' => $request->user()?->id,
            'body' => trim($validated['body']),
        ]);

        return $this->ok($note->load('author'), 'Note added', 201);
    }

    public function deleteNote(Request $request, $id, $noteId)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit', 'recruitment:delete']);

        $candidate = $this->resolveTenantModel(Candidate::class, $id);
        $note = $candidate->candidateNotes()->whereKey($noteId)->firstOrFail();

        $isAuthor = (int) $note->user_id === (int) $request->user()?->id;
        if (! $isAuthor) {
            $this->authorizePermission($request, 'recruitment:delete', 'You can only delete your own notes.');
        }

        $note->delete();

        return $this->ok(null, 'Note deleted');
    }

    // ---- pipeline --------------------------------------------------------------

    public function pipelineSummary(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $query = Candidate::query();

        if ($request->filled('job_opening_id')) {
            $query->where('job_opening_id', $request->job_opening_id);
        }

        $counts = $query
            ->selectRaw('stage, COUNT(*) as count')
            ->groupBy('stage')
            ->pluck('count', 'stage');

        $summary = collect(CandidateWorkflowService::STAGES)
            ->map(fn (string $stage) => ['stage' => $stage, 'count' => (int) ($counts[$stage] ?? 0)])
            ->values();

        return $this->ok($summary);
    }
}
