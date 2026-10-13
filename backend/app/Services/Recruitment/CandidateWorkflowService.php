<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\PipelineStage;
use App\Models\CandidateStageHistory;
use App\Models\Employee;
use App\Models\JobOpening;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CandidateWorkflowService
{
    public const STAGES = [
        'applied',
        'screening',
        'interview',
        'offer',
        'hired',
        'rejected',
    ];

    /**
     * Moves available through the generic update endpoint: one step forward,
     * rejection from any open stage, and reopening a rejected candidate.
     * "hired" is intentionally unreachable here; it only happens through hire().
     */
    public const STAGE_TRANSITIONS = [
        'applied' => ['applied', 'screening', 'rejected'],
        'screening' => ['screening', 'interview', 'rejected'],
        'interview' => ['interview', 'offer', 'rejected'],
        'offer' => ['offer', 'rejected'],
        'hired' => ['hired'],
        'rejected' => ['rejected', 'applied', 'screening'],
    ];

    public function assertValidStage(string $stage): void
    {
        if (! in_array($stage, self::STAGES, true)) {
            abort(422, 'Invalid recruitment stage.');
        }
    }

    public function assertValidTransition(string $currentStage, string $targetStage): void
    {
        $this->assertValidStage($currentStage);
        $this->assertValidStage($targetStage);

        if ($targetStage === 'hired' && $currentStage !== 'hired') {
            abort(422, 'Use the Hire action to hire a candidate.');
        }

        if (! in_array($targetStage, self::STAGE_TRANSITIONS[$currentStage] ?? [], true)) {
            abort(422, sprintf('Invalid candidate stage transition from "%s" to "%s".', $currentStage, $targetStage));
        }
    }

    /**
     * Validate a move for a real candidate against the pipeline that applies to their job: custom
     * stages may only be skipped when marked skippable, rejection is possible from any open stage,
     * and a rejected candidate can be reopened to the stage they were rejected from or earlier.
     *
     * @param  bool  $force  system-driven moves (an offer being created) skip the "required stage" check
     * @return array{stage: string, pipeline_stage: ?array}  where the candidate ends up
     */
    public function assertCanMove(Candidate $candidate, string $target, ?int $pipelineStageId = null, bool $force = false): array
    {
        $this->assertValidStage($target);
        $from = $candidate->stage;
        $pipeline = app(PipelineService::class);
        $stages = $pipeline->forCandidate($candidate);

        $targetStage = null;
        if ($pipelineStageId !== null) {
            $targetStage = $stages->first(fn (array $stage) => $stage['id'] === $pipelineStageId);
            if (! $targetStage || $targetStage['category'] !== $target) {
                throw ValidationException::withMessages(['pipeline_stage_id' => ["That stage does not belong to this job's pipeline."]]);
            }
        } elseif (in_array($target, PipelineStage::CATEGORIES, true)) {
            // Staying in the same category without naming a stage keeps the current stage.
            $targetStage = $from === $target
                ? ($stages[$pipeline->positionOf($candidate, $stages) ?? 0] ?? null)
                : $pipeline->firstOfCategory($stages, $target);
        }

        if ($target === 'hired' && $from !== 'hired') {
            abort(422, 'Use the Hire action to hire a candidate.');
        }

        if ($from === 'hired') {
            if ($target !== 'hired') {
                abort(422, sprintf('Invalid candidate stage transition from "%s" to "%s".', $from, $target));
            }

            return ['stage' => $target, 'pipeline_stage' => null];
        }

        if ($target === 'rejected') {
            return ['stage' => $target, 'pipeline_stage' => null];
        }

        if ($from === 'rejected') {
            $this->assertReopenTarget($candidate, $stages, $targetStage);

            return ['stage' => $target, 'pipeline_stage' => $targetStage];
        }

        $currentIndex = $pipeline->positionOf($candidate, $stages);
        $targetIndex = $targetStage ? $this->indexOfStage($stages, $targetStage) : null;

        if ($currentIndex === null || $targetIndex === null) {
            abort(422, sprintf('Invalid candidate stage transition from "%s" to "%s".', $from, $target));
        }

        if ($targetIndex === $currentIndex) {
            return ['stage' => $target, 'pipeline_stage' => $targetStage];
        }

        if ($targetIndex < $currentIndex) {
            // Going back is only possible within a category, for example between two interview rounds.
            if ($stages[$currentIndex]['category'] !== $target) {
                abort(422, sprintf('Invalid candidate stage transition from "%s" to "%s".', $from, $target));
            }

            return ['stage' => $target, 'pipeline_stage' => $targetStage];
        }

        if (! $force) {
            $skipped = $stages->slice($currentIndex + 1, $targetIndex - $currentIndex - 1)->reject(fn (array $stage) => $stage['is_skippable']);

            if ($skipped->isNotEmpty()) {
                abort(422, sprintf(
                    'Invalid candidate stage transition from "%s" to "%s": the "%s" stage cannot be skipped.',
                    $stages[$currentIndex]['name'],
                    $targetStage['name'],
                    $skipped->first()['name']
                ));
            }
        }

        return ['stage' => $target, 'pipeline_stage' => $targetStage];
    }

    private function indexOfStage(Collection $stages, array $stage): ?int
    {
        $index = $stages->search(fn (array $other) => $other['id'] === $stage['id'] && $other['name'] === $stage['name'] && $other['category'] === $stage['category']);

        return $index === false ? null : $index;
    }

    /**
     * Where a rejected candidate was before the rejection, as recorded in stage history.
     *
     * @return array{stage: string, pipeline_stage_id: ?int, label: ?string}|null
     */
    public function rejectedFrom(Candidate $candidate): ?array
    {
        $entry = CandidateStageHistory::query()
            ->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->where('to_stage', 'rejected')
            ->latest('id')
            ->first();

        if (! $entry || ! in_array($entry->from_stage, PipelineStage::CATEGORIES, true)) {
            return null;
        }

        return ['stage' => $entry->from_stage, 'pipeline_stage_id' => $entry->from_pipeline_stage_id, 'label' => $entry->from_label];
    }

    private function assertReopenTarget(Candidate $candidate, Collection $stages, ?array $targetStage): void
    {
        $pipeline = app(PipelineService::class);
        $targetIndex = $targetStage ? $this->indexOfStage($stages, $targetStage) : null;

        if ($targetIndex === null) {
            abort(422, 'That stage is not available for reopening.');
        }

        $origin = $this->rejectedFrom($candidate);

        if ($origin === null) {
            // Rejections recorded before stage history existed can go back to the start of the pipeline.
            if (! in_array($targetStage['category'], ['applied', 'screening'], true)) {
                abort(422, sprintf('Invalid candidate stage transition from "rejected" to "%s".', $targetStage['category']));
            }

            return;
        }

        $originIndex = $pipeline->positionOfStage($origin['stage'], $origin['pipeline_stage_id'], $stages) ?? 0;

        if ($targetIndex > $originIndex) {
            abort(422, 'A rejected candidate can be reopened to the stage they were rejected from, or an earlier one.');
        }
    }

    /**
     * Move a candidate to a new stage through the generic workflow (never to "hired";
     * see hire()), writing a stage-history row. Rejecting requires a reason.
     */
    public function changeStage(Candidate $candidate, string $target, ?int $actorId = null, ?string $reason = null, ?int $pipelineStageId = null, bool $force = false): Candidate
    {
        $from = $candidate->stage;
        $pipeline = app(PipelineService::class);
        $stages = $pipeline->forCandidate($candidate);
        $fromIndex = $pipeline->positionOf($candidate, $stages);
        $fromStage = $fromIndex === null ? null : $stages[$fromIndex];

        $move = $this->assertCanMove($candidate, $target, $pipelineStageId, $force);
        $toStage = $move['pipeline_stage'];

        if ($from === $target && ($toStage === null || ($fromStage && $toStage['id'] === $fromStage['id'] && $toStage['name'] === $fromStage['name']))) {
            return $candidate;
        }

        $reason = filled($reason) ? trim((string) $reason) : null;

        if ($target === 'rejected' && $reason === null) {
            throw ValidationException::withMessages(['rejection_reason' => ['A rejection reason is required.']]);
        }

        $fromLabel = $fromStage['name'] ?? ucfirst($from);
        $fromId = $fromStage['id'] ?? null;

        DB::transaction(function () use ($candidate, $from, $target, $actorId, $reason, $toStage, $fromLabel, $fromId) {
            $attributes = [
                'stage' => $target,
                'rejection_reason' => $target === 'rejected' ? $reason : null,
                // Reopening a withdrawn application makes it a live one again.
                'withdrawn_at' => $target === 'rejected' ? $candidate->withdrawn_at : null,
            ];

            if ($target !== 'rejected') {
                $attributes['pipeline_stage_id'] = $toStage['id'] ?? null;
            }

            $candidate->update($attributes);

            if ($target === 'rejected') {
                app(OfferService::class)->withdrawForCandidate($candidate);
            }

            $this->recordStage(
                $candidate, $from, $target, $actorId, $reason,
                $fromLabel, $target === 'rejected' ? 'Rejected' : ($toStage['name'] ?? ucfirst($target)),
                $fromId, $target === 'rejected' ? null : ($toStage['id'] ?? null)
            );
        });

        return $candidate;
    }

    public function recordStage(
        Candidate $candidate,
        ?string $from,
        string $to,
        ?int $actorId = null,
        ?string $reason = null,
        ?string $fromLabel = null,
        ?string $toLabel = null,
        ?int $fromPipelineStageId = null,
        ?int $toPipelineStageId = null
    ): void {
        CandidateStageHistory::create([
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'from_stage' => $from,
            'to_stage' => $to,
            'changed_by' => $actorId,
            'reason' => $reason,
            'from_label' => $fromLabel,
            'to_label' => $toLabel ?? ucfirst($to),
            'from_pipeline_stage_id' => $fromPipelineStageId,
            'to_pipeline_stage_id' => $toPipelineStageId,
        ]);
    }

    public function isReopen(string $currentStage, string $targetStage): bool
    {
        return $currentStage === 'rejected' && $targetStage !== 'rejected';
    }

    /** What the pipeline looks like for one candidate, for the detail page. */
    public function pipelineFor(Candidate $candidate): array
    {
        $pipeline = app(PipelineService::class);
        $resolved = $pipeline->resolve($candidate->company_id, $candidate->job_opening_id);
        $stages = $resolved['stages'];
        $index = $pipeline->positionOf($candidate, $stages);
        $origin = $candidate->stage === 'rejected' ? $this->rejectedFrom($candidate) : null;
        $originIndex = $origin ? $pipeline->positionOfStage($origin['stage'], $origin['pipeline_stage_id'], $stages) : null;

        return [
            'scope' => $resolved['scope'],
            'stages' => $stages->values(),
            'current_index' => $index,
            'current' => $index === null ? null : $stages[$index],
            'reopen_to' => $originIndex === null ? null : $stages[$originIndex],
        ];
    }

    /**
     * Hire a candidate: create (or reuse) the user and employee, mark the candidate
     * hired, open the onboarding record and close the job once all positions are filled.
     *
     * @param  array{salary?: float|int|string|null, joining_date?: string|null}  $overrides
     * @return array{employee: Employee, temp_password: ?string}
     */
    public function hire(Candidate $candidate, array $overrides = [], ?int $actorId = null): array
    {
        if ($candidate->employee_id && $candidate->stage === 'hired') {
            throw ValidationException::withMessages(['candidate' => ['This candidate has already been hired.']]);
        }

        if ($candidate->stage !== 'offer' && ! ($candidate->stage === 'hired' && ! $candidate->employee_id)) {
            throw ValidationException::withMessages(['stage' => ['Only candidates in the offer stage can be hired.']]);
        }

        $jobOpening = $candidate->jobOpening;
        if (! $jobOpening || ! $jobOpening->department_id) {
            throw ValidationException::withMessages(['job_opening_id' => ['The linked job opening has no department. Assign a department before hiring.']]);
        }

        app(CandidateCheckService::class)->assertCleared($candidate);

        $offer = app(OfferService::class)->acceptedOfferFor($candidate);

        if ($offer) {
            $salary = $offer->salary;
            $joiningDate = $overrides['joining_date'] ?? $offer->start_date?->toDateString() ?? now()->toDateString();
        } elseif (! empty($overrides['skip_offer'])) {
            $salary = $overrides['salary'] ?? null;
            $joiningDate = $overrides['joining_date'] ?? $candidate->onboarding_start_date?->toDateString() ?? now()->toDateString();
        } else {
            throw ValidationException::withMessages(['offer' => ['An accepted offer is required before hiring this candidate.']]);
        }

        if ($salary === null || $salary === '' || ! is_numeric($salary) || (float) $salary < 0) {
            throw ValidationException::withMessages(['salary' => ['A valid salary is required to hire this candidate.']]);
        }

        $companyId = $candidate->company_id;
        $email = Str::lower(trim($candidate->email));
        $onboarding = app(OnboardingService::class);
        $template = $onboarding->resolveTemplate($companyId, isset($overrides['template_id']) ? (int) $overrides['template_id'] : null);

        return DB::transaction(function () use ($candidate, $jobOpening, $companyId, $email, $salary, $joiningDate, $actorId, $onboarding, $template) {
            // employees.email is unique across all companies, so look it up globally and
            // explain which situation applies instead of failing on the unique index.
            $existingEmployee = Employee::query()
                ->whereRaw('LOWER(email) = ?', [$email])
                ->first();

            if ($existingEmployee) {
                $message = (string) $existingEmployee->company_id === (string) $companyId
                    ? 'An employee with this email already exists in your company.'
                    : 'This email is already registered to another company.';

                throw ValidationException::withMessages(['email' => [$message]]);
            }

            $tempPassword = null;
            $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

            if ($user && (string) $user->company_id !== (string) $companyId) {
                throw ValidationException::withMessages(['email' => ['This email is already registered to another company.']]);
            }

            if (! $user) {
                $tempPassword = Str::password(12);
                $user = User::create([
                    'name' => $candidate->full_name,
                    'email' => $candidate->email,
                    'username' => Str::slug(explode('@', $candidate->email)[0]) . '-' . Str::lower(Str::random(4)),
                    'password' => Hash::make($tempPassword),
                    'must_change_password' => true,
                    'company_id' => $companyId,
                ]);
            }

            $this->assignEmployeeRole($user);

            $employee = Employee::create([
                'user_id' => $user->id,
                'company_id' => $companyId,
                'name' => $candidate->full_name,
                'email' => $candidate->email,
                'phone' => $candidate->phone,
                'department_id' => $jobOpening->department_id,
                'designation' => $jobOpening->title,
                'employment_type' => $jobOpening->employment_type,
                'joining_date' => $joiningDate,
                'basic_salary' => (float) $salary,
                'allowances' => 0,
                'salary' => (float) $salary,
                'status' => 'active',
            ]);

            $previousStage = $candidate->stage;

            $candidate->update([
                'stage' => 'hired',
                'rejection_reason' => null,
                'employee_id' => $employee->id,
                'onboarding_status' => $candidate->onboarding_status ?: 'pending',
                'onboarding_start_date' => $candidate->onboarding_start_date ?: $joiningDate,
            ]);

            if ($previousStage !== 'hired') {
                $this->recordStage($candidate, $previousStage, 'hired', $actorId);
            }

            $onboarding->applyTemplate($candidate, $template, $employee, (string) $joiningDate, $actorId);

            app(ReferralService::class)->onHired($candidate, $salary, (string) $joiningDate);

            $this->closeJobIfFilled($jobOpening);

            return ['employee' => $employee, 'temp_password' => $tempPassword];
        });
    }

    public function closeJobIfFilled(JobOpening $jobOpening): void
    {
        if ($jobOpening->status !== 'open') {
            return;
        }

        $hired = Candidate::query()
            ->where('job_opening_id', $jobOpening->id)
            ->where('stage', 'hired')
            ->count();

        if ($hired >= (int) $jobOpening->open_positions) {
            $jobOpening->update(['status' => 'closed', 'closed_at' => now()->toDateString()]);
        }
    }

    private function assignEmployeeRole(User $user): void
    {
        $role = Role::firstOrCreate(
            ['name' => User::ROLE_EMPLOYEE, 'company_id' => null],
            ['guard_name' => 'web', 'description' => 'Default employee role', 'is_system' => true]
        );

        $user->assignRole($role);
    }
}
