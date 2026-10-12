<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\Offer;
use App\Models\OnboardingTask;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class RecruitmentAnalyticsService
{
    private const FUNNEL_STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'];

    /** Numbers for the recruitment landing page and the dashboard widget. */
    public function overview(): array
    {
        $weekStart = now()->startOfWeek();
        $weekEnd = now()->endOfWeek();

        $pipeline = Candidate::query()
            ->selectRaw('stage, COUNT(*) as count')
            ->groupBy('stage')
            ->pluck('count', 'stage');

        $scorecardsOverdue = Interview::query()
            ->where('status', 'scheduled')
            ->whereNotNull('interviewer_id')
            ->get(['id', 'scheduled_at', 'duration_minutes'])
            ->filter(fn (Interview $interview) => $interview->endsAt()?->isPast())
            ->count();

        return [
            'open_jobs' => JobOpening::query()->where('status', 'open')->count(),
            'active_candidates' => Candidate::query()
                ->where('status', 'active')
                ->whereNotIn('stage', ['hired', 'rejected'])
                ->count(),
            'interviews_this_week' => Interview::query()
                ->where('status', 'scheduled')
                ->whereBetween('scheduled_at', [$weekStart, $weekEnd])
                ->count(),
            'offers_pending' => Offer::query()->whereIn('status', ['pending_approval', 'approved', 'sent'])->count(),
            'pipeline' => collect(CandidateWorkflowService::STAGES)
                ->map(fn (string $stage) => ['stage' => $stage, 'count' => (int) ($pipeline[$stage] ?? 0)])
                ->values()
                ->all(),
            'attention' => [
                'scorecards_overdue' => $scorecardsOverdue,
                'offers_awaiting_approval' => Offer::query()->where('status', 'pending_approval')->count(),
                'offers_expiring_soon' => Offer::query()
                    ->where('status', 'sent')
                    ->whereNotNull('expires_at')
                    ->whereBetween('expires_at', [now()->toDateString(), now()->addDays(3)->toDateString()])
                    ->count(),
                'onboarding_tasks_due' => OnboardingTask::query()
                    ->where('status', 'pending')
                    ->whereNotNull('due_date')
                    ->whereDate('due_date', '<=', now()->toDateString())
                    ->count(),
            ],
        ];
    }

    /** Hiring analytics for candidates who applied inside the window. */
    public function analytics(Carbon $from, Carbon $to, ?int $jobOpeningId = null): array
    {
        $candidates = Candidate::query()
            ->whereBetween('applied_at', [$from->toDateString(), $to->toDateString()])
            ->when($jobOpeningId, fn ($query) => $query->where('job_opening_id', $jobOpeningId))
            ->get(['id', 'stage', 'source', 'applied_at', 'created_at', 'rejection_reason', 'job_opening_id']);

        $histories = CandidateStageHistory::query()
            ->whereIn('candidate_id', $candidates->pluck('id'))
            ->get(['candidate_id', 'to_stage', 'created_at'])
            ->groupBy('candidate_id');

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'total_candidates' => $candidates->count(),
            'funnel' => $this->funnel($candidates, $histories),
            'time_to_hire' => $this->timeToHire($candidates, $histories),
            'sources' => $this->sources($candidates),
            'rejection_reasons' => $this->rejectionReasons($candidates),
            'offers' => $this->offers($candidates->pluck('id')),
            'jobs' => $this->jobs($jobOpeningId),
        ];
    }

    /**
     * A candidate "reached" a stage if the history says so, or if their current stage is
     * at or beyond it (covers candidates created before stage history was recorded).
     */
    private function funnel(Collection $candidates, Collection $histories): array
    {
        $order = array_flip(self::FUNNEL_STAGES);
        $reached = array_fill_keys(self::FUNNEL_STAGES, 0);

        foreach ($candidates as $candidate) {
            $stages = collect($histories->get($candidate->id, []))->pluck('to_stage')->all();
            $stages[] = 'applied';

            if (isset($order[$candidate->stage])) {
                $stages = array_merge($stages, array_slice(self::FUNNEL_STAGES, 0, $order[$candidate->stage] + 1));
            }

            foreach (array_intersect(self::FUNNEL_STAGES, array_unique($stages)) as $stage) {
                $reached[$stage]++;
            }
        }

        $funnel = [];
        $previous = null;

        foreach (self::FUNNEL_STAGES as $stage) {
            $count = $reached[$stage];
            $funnel[] = [
                'stage' => $stage,
                'count' => $count,
                'conversion_from_previous' => $previous === null ? null : ($previous > 0 ? round($count / $previous * 100, 1) : 0.0),
            ];
            $previous = $count;
        }

        return $funnel;
    }

    private function timeToHire(Collection $candidates, Collection $histories): array
    {
        $days = $candidates
            ->where('stage', 'hired')
            ->map(function (Candidate $candidate) use ($histories) {
                $hiredAt = collect($histories->get($candidate->id, []))->firstWhere('to_stage', 'hired')?->created_at;
                $appliedAt = $candidate->applied_at ?? $candidate->created_at;

                // Whole calendar days from the application date to the day they were hired.
                return $hiredAt && $appliedAt
                    ? max(0, (int) Carbon::parse($appliedAt)->startOfDay()->diffInDays(Carbon::parse($hiredAt)->startOfDay()))
                    : null;
            })
            ->filter(fn ($value) => $value !== null)
            ->values();

        return [
            'hires' => $days->count(),
            'average_days' => $days->isEmpty() ? null : round($days->avg(), 1),
            'fastest_days' => $days->isEmpty() ? null : (int) $days->min(),
            'slowest_days' => $days->isEmpty() ? null : (int) $days->max(),
        ];
    }

    private function sources(Collection $candidates): array
    {
        return $candidates
            ->groupBy(fn (Candidate $candidate) => filled($candidate->source) ? $candidate->source : 'Unknown')
            ->map(function (Collection $group, string $source) {
                $hired = $group->where('stage', 'hired')->count();

                return [
                    'source' => $source,
                    'candidates' => $group->count(),
                    'hired' => $hired,
                    'hire_rate' => round($hired / max($group->count(), 1) * 100, 1),
                ];
            })
            ->sortByDesc('candidates')
            ->values()
            ->all();
    }

    private function rejectionReasons(Collection $candidates): array
    {
        return $candidates
            ->where('stage', 'rejected')
            ->groupBy(fn (Candidate $candidate) => filled($candidate->rejection_reason) ? trim($candidate->rejection_reason) : 'No reason recorded')
            ->map(fn (Collection $group, string $reason) => ['reason' => $reason, 'count' => $group->count()])
            ->sortByDesc('count')
            ->take(10)
            ->values()
            ->all();
    }

    private function offers(Collection $candidateIds): array
    {
        $counts = Offer::query()
            ->whereIn('candidate_id', $candidateIds)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $accepted = (int) ($counts['accepted'] ?? 0);
        $decided = $accepted + (int) ($counts['declined'] ?? 0) + (int) ($counts['expired'] ?? 0);

        return [
            'total' => (int) $counts->sum(),
            'sent' => (int) $counts->only(['sent', 'accepted', 'declined', 'expired'])->sum(),
            'accepted' => $accepted,
            'declined' => (int) ($counts['declined'] ?? 0),
            'expired' => (int) ($counts['expired'] ?? 0),
            'acceptance_rate' => $decided > 0 ? round($accepted / $decided * 100, 1) : null,
        ];
    }

    private function jobs(?int $jobOpeningId): array
    {
        return JobOpening::query()
            ->when($jobOpeningId, fn ($query) => $query->whereKey($jobOpeningId), fn ($query) => $query->where('status', 'open'))
            ->withCount([
                'candidates',
                'candidates as hired_count' => fn ($query) => $query->where('stage', 'hired'),
            ])
            ->orderBy('title')
            ->get(['id', 'title', 'open_positions', 'status'])
            ->map(fn (JobOpening $job) => [
                'id' => $job->id,
                'title' => $job->title,
                'status' => $job->status,
                'open_positions' => $job->open_positions,
                'candidates' => $job->candidates_count,
                'hired' => $job->hired_count,
            ])
            ->values()
            ->all();
    }
}
