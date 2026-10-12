<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\Interview;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * In-app notifications for recruitment events. A failure here must never break
 * the action that triggered it, so every public method swallows and logs errors.
 */
class RecruitmentNotificationService
{
    private const TEAM_ROLES = [User::ROLE_RECRUITER, User::ROLE_HR_MANAGER, User::ROLE_COMPANY_ADMIN];

    public function candidateAdded(Candidate $candidate, ?int $actorId = null): void
    {
        $this->safely(function () use ($candidate, $actorId) {
            $candidate->loadMissing('jobOpening');
            $owners = $this->jobOwnerIds($candidate);

            // Public applications have no staff actor, so fall back to the whole recruitment team.
            if ($owners->isEmpty() && $actorId === null) {
                $owners = $this->teamIds($candidate->company_id);
            }

            $this->send(
                $owners->reject(fn ($id) => $id === $actorId)->all(),
                'recruitment_candidate',
                'New candidate: ' . $candidate->full_name,
                sprintf('%s applied for %s.', $candidate->full_name, $candidate->jobOpening?->title ?? 'a job opening'),
                $candidate->company_id,
                $actorId,
                '/recruitment/candidates/' . $candidate->id
            );
        });
    }

    public function stageChanged(Candidate $candidate, string $from, ?int $actorId = null): void
    {
        if (! in_array($candidate->stage, ['offer', 'rejected', 'hired'], true)) {
            return;
        }

        $this->safely(function () use ($candidate, $from, $actorId) {
            $candidate->loadMissing('jobOpening');

            $this->send(
                $this->jobOwnerIds($candidate)->reject(fn ($id) => $id === $actorId)->all(),
                'recruitment_stage',
                sprintf('%s moved to %s', $candidate->full_name, $candidate->stage),
                sprintf('%s moved from %s to %s for %s.', $candidate->full_name, $from, $candidate->stage, $candidate->jobOpening?->title ?? 'a job'),
                $candidate->company_id,
                $actorId,
                '/recruitment/candidates/' . $candidate->id
            );
        });
    }

    public function candidateHired(Candidate $candidate, ?int $actorId = null): void
    {
        $this->stageChanged($candidate, 'offer', $actorId);
    }

    public function interviewScheduled(Interview $interview, ?int $actorId, string $event = 'scheduled'): void
    {
        $this->safely(function () use ($interview, $actorId, $event) {
            $interview->loadMissing(['candidate.jobOpening', 'interviewer']);
            $userId = $interview->interviewer?->user_id;

            if (! $userId || $userId === $actorId) {
                return;
            }

            $verb = match ($event) {
                'rescheduled' => 'rescheduled',
                'cancelled' => 'cancelled',
                default => 'scheduled',
            };

            $this->send(
                [$userId],
                'recruitment_interview',
                "Interview {$verb}: " . ($interview->candidate?->full_name ?? 'candidate'),
                sprintf(
                    'Your %s interview with %s for %s is %s%s.',
                    $interview->interview_type,
                    $interview->candidate?->full_name ?? 'a candidate',
                    $interview->candidate?->jobOpening?->title ?? 'a job',
                    $verb,
                    $event === 'cancelled' ? '' : ' for ' . $interview->scheduled_at?->format('D, d M Y H:i')
                ),
                $interview->company_id,
                $actorId,
                '/recruitment/interviews'
            );
        });
    }

    public function scorecardSubmitted(Interview $interview, ?int $submitterId): void
    {
        $this->safely(function () use ($interview, $submitterId) {
            $interview->loadMissing(['candidate.jobOpening', 'interviewer']);
            $recipients = collect([$interview->created_by])
                ->merge($interview->candidate ? $this->jobOwnerIds($interview->candidate) : [])
                ->filter()
                ->unique()
                ->reject(fn ($id) => $id === $submitterId);

            $this->send(
                $recipients->values()->all(),
                'recruitment_scorecard',
                'Scorecard submitted: ' . ($interview->candidate?->full_name ?? 'candidate'),
                sprintf(
                    'Feedback for %s was submitted by %s (%s).',
                    $interview->candidate?->full_name ?? 'a candidate',
                    $interview->interviewer?->name ?? $interview->interviewer_name,
                    $interview->result
                ),
                $interview->company_id,
                $submitterId,
                '/recruitment/candidates/' . $interview->candidate_id
            );
        });
    }

    public function scorecardReminder(Interview $interview): void
    {
        $this->safely(function () use ($interview) {
            $interview->loadMissing(['candidate', 'interviewer']);
            $userId = $interview->interviewer?->user_id;

            if (! $userId) {
                return;
            }

            $this->send(
                [$userId],
                'recruitment_scorecard_due',
                'Scorecard due: ' . ($interview->candidate?->full_name ?? 'candidate'),
                sprintf('Please submit your feedback for the interview with %s.', $interview->candidate?->full_name ?? 'a candidate'),
                $interview->company_id,
                null,
                '/recruitment/interviews'
            );
        });
    }

    /** @param  array<int, int>  $recipientIds */
    public function notifyUsers(array $recipientIds, string $type, string $title, string $message, ?string $companyId, ?int $actorId, string $link): void
    {
        $this->safely(fn () => $this->send(
            collect($recipientIds)->filter()->unique()->reject(fn ($id) => $id === $actorId)->values()->all(),
            $type,
            $title,
            $message,
            $companyId,
            $actorId,
            $link
        ));
    }

    /** Tell the people who own the candidate's job (or the whole team when nobody does). */
    public function notifyOwners(Candidate $candidate, string $type, string $title, string $message, ?int $actorId = null): void
    {
        $this->safely(function () use ($candidate, $type, $title, $message, $actorId) {
            $candidate->loadMissing('jobOpening');
            $owners = $this->jobOwnerIds($candidate);

            if ($owners->isEmpty()) {
                $owners = $this->teamIds($candidate->company_id);
            }

            $this->send($owners->reject(fn ($id) => $id === $actorId)->all(), $type, $title, $message, $candidate->company_id, $actorId, '/recruitment/candidates/' . $candidate->id);
        });
    }

    /** @return Collection<int, int> */
    public function teamIds(?string $companyId): Collection
    {
        return User::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->whereHas('roles', fn ($query) => $query->whereIn('name', self::TEAM_ROLES))
            ->pluck('id')
            ->map(fn ($id) => (int) $id);
    }

    /** @return Collection<int, int> */
    public function jobOwnerIds(Candidate $candidate): Collection
    {
        $job = $candidate->jobOpening;

        return collect([$job?->recruiter_id, $job?->hiring_manager_id])
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }

    private function send(array $recipientIds, string $type, string $title, string $message, ?string $companyId, ?int $actorId, string $link): void
    {
        foreach (array_unique($recipientIds) as $userId) {
            NotificationItem::create([
                'user_id' => $userId,
                'company_id' => $companyId,
                'type' => $type,
                'title' => $title,
                'message' => $message,
                'link' => $link,
                'is_read' => false,
                'created_by' => $actorId,
            ]);
        }
    }

    private function safely(callable $callback): void
    {
        try {
            $callback();
        } catch (Throwable $exception) {
            Log::warning('Recruitment notification failed: ' . $exception->getMessage());
        }
    }
}
