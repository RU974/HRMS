<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\Employee;
use App\Models\OnboardingTask;
use App\Models\OnboardingTemplate;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class OnboardingService
{
    public function __construct(private readonly RecruitmentNotificationService $notifications)
    {
    }

    /**
     * The template chosen at hire time, falling back to the company's default (if any).
     * A template id from another company is treated as missing.
     */
    public function resolveTemplate(?string $companyId, ?int $templateId): ?OnboardingTemplate
    {
        $query = OnboardingTemplate::query()->withoutGlobalScopes()->where('company_id', $companyId);

        if ($templateId) {
            $template = (clone $query)->with('tasks')->find($templateId);

            if (! $template) {
                throw ValidationException::withMessages(['template_id' => ['The selected onboarding template does not exist.']]);
            }

            return $template;
        }

        return $query->where('is_default', true)->with('tasks')->first();
    }

    /** Create the candidate's onboarding tasks from a template, anchored on the joining date. */
    public function applyTemplate(Candidate $candidate, ?OnboardingTemplate $template, Employee $employee, string $joiningDate, ?int $actorId = null): int
    {
        if (! $template) {
            return 0;
        }

        $candidate->loadMissing('jobOpening');
        $job = $candidate->jobOpening;
        $anchor = Carbon::parse($joiningDate);
        $assigneeTaskCounts = [];

        foreach ($template->tasks as $index => $templateTask) {
            $assigneeId = match ($templateTask->assignee_type) {
                'user' => $templateTask->assignee_user_id,
                'hiring_manager' => $job?->hiring_manager_id,
                'recruiter' => $job?->recruiter_id,
                'new_hire' => $employee->user_id,
                default => null,
            };

            OnboardingTask::create([
                'company_id' => $candidate->company_id,
                'candidate_id' => $candidate->id,
                'title' => $templateTask->title,
                'description' => $templateTask->description,
                'assignee_id' => $assigneeId,
                'due_date' => $anchor->copy()->addDays((int) $templateTask->due_offset_days)->toDateString(),
                'link_type' => $templateTask->link_type,
                'sort_order' => $index,
            ]);

            if ($assigneeId) {
                $assigneeTaskCounts[$assigneeId] = ($assigneeTaskCounts[$assigneeId] ?? 0) + 1;
            }
        }

        foreach ($assigneeTaskCounts as $userId => $count) {
            $this->notifyAssignee((int) $userId, $candidate, $count, $actorId);
        }

        return $template->tasks->count();
    }

    public function addTask(Candidate $candidate, array $data, ?int $actorId = null): OnboardingTask
    {
        $task = OnboardingTask::create([
            ...$data,
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'sort_order' => (int) $candidate->onboardingTasks()->max('sort_order') + 1,
        ]);

        if ($task->assignee_id) {
            $this->notifyAssignee((int) $task->assignee_id, $candidate, 1, $actorId);
        }

        $this->syncCandidateStatus($candidate);

        return $task;
    }

    public function setTaskStatus(OnboardingTask $task, string $status, ?int $actorId): OnboardingTask
    {
        $done = in_array($status, ['completed', 'skipped'], true);

        $task->update([
            'status' => $status,
            'completed_at' => $done ? now() : null,
            'completed_by' => $done ? $actorId : null,
        ]);

        $candidate = Candidate::query()->withoutGlobalScopes()->find($task->candidate_id);
        if ($candidate) {
            $this->syncCandidateStatus($candidate);
        }

        return $task;
    }

    /**
     * Keep the candidate's onboarding status in step with its tasks. An explicit "deferred"
     * status is never overridden, and an in-progress record is not downgraded just because
     * no task has been ticked yet.
     */
    public function syncCandidateStatus(Candidate $candidate): void
    {
        if ($candidate->onboarding_status === 'deferred') {
            return;
        }

        $tasks = $candidate->onboardingTasks()->get(['id', 'status']);

        if ($tasks->isEmpty()) {
            return;
        }

        $doneCount = $tasks->filter(fn (OnboardingTask $task) => $task->isDone())->count();

        $status = match (true) {
            $doneCount === $tasks->count() => 'completed',
            $doneCount > 0 => 'in_progress',
            $candidate->onboarding_status === 'completed' => 'pending',
            default => $candidate->onboarding_status ?: 'pending',
        };

        if ($status !== $candidate->onboarding_status) {
            $candidate->update(['onboarding_status' => $status]);
        }
    }

    public function remindDueTasks(): int
    {
        $tasks = OnboardingTask::query()
            ->withoutGlobalScopes()
            ->where('status', 'pending')
            ->whereNotNull('assignee_id')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', now()->toDateString())
            ->whereNull('reminded_at')
            ->with('candidate:id,full_name,company_id')
            ->get();

        foreach ($tasks as $task) {
            $this->notifications->notifyUsers(
                [$task->assignee_id],
                'recruitment_task_due',
                'Onboarding task due: ' . $task->title,
                sprintf('"%s" for %s is due %s.', $task->title, $task->candidate?->full_name ?? 'a new hire', $task->due_date->isToday() ? 'today' : 'since ' . $task->due_date->format('d M')),
                $task->company_id,
                null,
                '/recruitment/onboarding'
            );

            $task->forceFill(['reminded_at' => now()])->save();
        }

        return $tasks->count();
    }

    public function notifyReassigned(OnboardingTask $task, Candidate $candidate, ?int $actorId): void
    {
        if ($task->assignee_id) {
            $this->notifyAssignee((int) $task->assignee_id, $candidate, 1, $actorId);
        }
    }

    private function notifyAssignee(int $userId, Candidate $candidate, int $count, ?int $actorId): void
    {
        $this->notifications->notifyUsers(
            [$userId],
            'recruitment_task',
            $count === 1 ? 'New onboarding task assigned' : "{$count} onboarding tasks assigned",
            sprintf('You have %d onboarding task%s for %s.', $count, $count === 1 ? '' : 's', $candidate->full_name),
            $candidate->company_id,
            $actorId,
            '/recruitment/onboarding'
        );
    }

}
