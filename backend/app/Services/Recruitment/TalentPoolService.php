<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateNote;
use App\Models\Company;
use App\Models\JobOpening;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Rejected or not-yet-hired people stay in the system. The talent pool marks the ones worth
 * calling again ("silver medalists" finished close behind the hire) and lets recruiters put
 * them forward for a new opening without asking them to apply from scratch.
 *
 * Staying on file is limited: every entry lapses after the company's retention period, and a
 * candidate can say no, after which they are never suggested or put forward again.
 */
class TalentPoolService
{
    /** How long before a pool entry lapses the team is warned. */
    public const WARNING_DAYS = 14;

    public function __construct(
        private readonly CandidateWorkflowService $workflow,
        private readonly FitScoringService $fit,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    /** When a pool entry made today lapses, from the company's retention setting (null = never). */
    public function expiryFor(?string $companyId): ?Carbon
    {
        $months = $companyId ? Company::query()->whereKey($companyId)->value('talent_pool_retention_months') : null;

        return $months ? now()->addMonths((int) $months) : null;
    }

    public function add(Candidate $candidate, string $pool, ?string $note = null): Candidate
    {
        if (! in_array($pool, Candidate::TALENT_POOLS, true)) {
            throw ValidationException::withMessages(['pool' => ['Unknown talent pool.']]);
        }

        if ($candidate->stage === 'hired') {
            throw ValidationException::withMessages(['pool' => ['Hired candidates are employees now and cannot join the talent pool.']]);
        }

        if ($candidate->anonymized_at) {
            throw ValidationException::withMessages(['pool' => ['This candidate\'s data was erased and cannot be kept on file.']]);
        }

        if ($candidate->pool_consent === 'declined') {
            throw ValidationException::withMessages(['pool' => ['This candidate asked not to be kept on file for future roles.']]);
        }

        $isNew = $candidate->talent_pool === null;

        $candidate->update([
            'talent_pool' => $pool,
            'talent_pool_note' => filled($note) ? trim($note) : $candidate->talent_pool_note,
            'talent_pool_added_at' => $candidate->talent_pool === $pool ? $candidate->talent_pool_added_at : now(),
            // Joining the pool starts a retention period. Consent stays as it was.
            'talent_pool_expires_at' => $isNew ? $this->expiryFor($candidate->company_id) : $candidate->talent_pool_expires_at,
            'pool_consent' => $candidate->pool_consent ?? 'unconfirmed',
        ]);

        return $candidate;
    }

    public function remove(Candidate $candidate): Candidate
    {
        $candidate->update([
            'talent_pool' => null,
            'talent_pool_note' => null,
            'talent_pool_added_at' => null,
            'talent_pool_expires_at' => null,
        ]);

        return $candidate;
    }

    /** The candidate says yes: they stay on file and the retention period starts again. */
    public function grantConsent(Candidate $candidate): Candidate
    {
        $candidate->update([
            'pool_consent' => 'granted',
            'pool_consent_at' => now(),
            'talent_pool_expires_at' => $candidate->talent_pool ? $this->expiryFor($candidate->company_id) : $candidate->talent_pool_expires_at,
        ]);

        return $candidate;
    }

    /** The candidate says no: they leave the pool and are never suggested or put forward again. */
    public function declineConsent(Candidate $candidate): Candidate
    {
        $candidate->update([
            'pool_consent' => 'declined',
            'pool_consent_at' => now(),
            'talent_pool' => null,
            'talent_pool_note' => null,
            'talent_pool_added_at' => null,
            'talent_pool_expires_at' => null,
        ]);

        return $candidate;
    }

    public function markConsentRequested(Candidate $candidate): Candidate
    {
        $candidate->update([
            'pool_consent' => $candidate->pool_consent === 'granted' ? 'granted' : 'pending',
            'pool_consent_requested_at' => now(),
        ]);

        return $candidate;
    }

    /**
     * Remove everyone whose retention period has ended and warn the team about those about to lapse.
     *
     * @return array{expired: int, warned: int}
     */
    public function applyExpiry(): array
    {
        $expired = 0;

        Candidate::query()->withoutGlobalScopes()->whereNotNull('talent_pool')->whereNotNull('talent_pool_expires_at')
            ->where('talent_pool_expires_at', '<=', now())
            ->each(function (Candidate $candidate) use (&$expired) {
                $this->remove($candidate);

                CandidateNote::create([
                    'company_id' => $candidate->company_id,
                    'candidate_id' => $candidate->id,
                    'user_id' => null,
                    'body' => 'Left the talent pool because the retention period ended.',
                ]);

                $expired++;
            });

        // Each entry falls into the one-day window exactly once, so a daily run warns once.
        $warned = 0;
        $soon = Candidate::query()->withoutGlobalScopes()->whereNotNull('talent_pool')
            ->whereBetween('talent_pool_expires_at', [now()->addDays(self::WARNING_DAYS - 1), now()->addDays(self::WARNING_DAYS)])
            ->get()->groupBy('company_id');

        foreach ($soon as $companyId => $people) {
            $this->notifications->notifyUsers(
                $this->notifications->teamIds($companyId ?: null)->all(),
                'recruitment_talent_pool',
                sprintf('%d talent pool entries expire soon', $people->count()),
                'Ask them to stay on file, or let them lapse: ' . $people->take(3)->pluck('full_name')->implode(', ') . ($people->count() > 3 ? '…' : ''),
                $companyId ?: null,
                null,
                '/recruitment/talent-pool'
            );
            $warned += $people->count();
        }

        return ['expired' => $expired, 'warned' => $warned];
    }

    /** Tell a new opening's owners when the pool already holds people who look like a match. */
    public function notifyMatches(JobOpening $job): int
    {
        try {
            $matches = $this->fit->suggestFromPool($job, 5, 50);

            if ($matches->isEmpty()) {
                return 0;
            }

            $owners = collect([$job->recruiter_id, $job->hiring_manager_id])->filter()->map(fn ($id) => (int) $id);
            $recipients = $owners->isEmpty() ? $this->notifications->teamIds($job->company_id) : $owners;

            $this->notifications->notifyUsers(
                $recipients->all(),
                'recruitment_talent_pool',
                sprintf('%d talent pool candidates match "%s"', $matches->count(), $job->title),
                'Best match: ' . $matches->first()['full_name'] . ' (' . $matches->first()['fit_score'] . '% fit). Open the job to see suggestions.',
                $job->company_id,
                null,
                '/recruitment/jobs'
            );

            return $matches->count();
        } catch (Throwable $exception) {
            report($exception);

            return 0;
        }
    }

    /**
     * Put a talent-pool candidate forward for another opening. The original application is left
     * untouched; the new one starts at "applied" with the contact details, skills and resume.
     */
    public function reapply(Candidate $source, JobOpening $job, User $actor): Candidate
    {
        if ($job->status !== 'open') {
            throw ValidationException::withMessages(['job_opening_id' => ['This job opening is not open for new candidates.']]);
        }

        if ($source->pool_consent === 'declined' || $source->anonymized_at) {
            throw ValidationException::withMessages(['job_opening_id' => ['This candidate asked not to be contacted about other roles.']]);
        }

        if ((int) $source->job_opening_id === (int) $job->id) {
            throw ValidationException::withMessages(['job_opening_id' => ['The candidate already applied for this job.']]);
        }

        $exists = Candidate::query()->withoutGlobalScopes()
            ->where('company_id', $source->company_id)
            ->where('job_opening_id', $job->id)
            ->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($source->email))])
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages(['job_opening_id' => ['The candidate already applied for this job.']]);
        }

        return DB::transaction(function () use ($source, $job, $actor) {
            $copy = Candidate::create([
                'company_id' => $source->company_id,
                'job_opening_id' => $job->id,
                'full_name' => $source->full_name,
                'email' => $source->email,
                'phone' => $source->phone,
                'source' => 'Talent pool',
                'stage' => 'applied',
                'status' => 'active',
                'applied_at' => now()->toDateString(),
                'rating' => $source->rating,
                'tags' => $source->tags,
                'skills' => $source->skills,
                'experience_years' => $source->experience_years,
                'resume_text' => $source->resume_text,
                'resume_parsed' => $source->resume_parsed,
            ]);

            if ($source->resume_path && Storage::disk(ResumeStorageService::DISK)->exists($source->resume_path)) {
                $target = ResumeStorageService::DIRECTORY . '/' . ($copy->company_id ?? 'shared') . '/' . Str::random(40) . '.' . pathinfo($source->resume_path, PATHINFO_EXTENSION);
                Storage::disk(ResumeStorageService::DISK)->copy($source->resume_path, $target);
                $copy->update(['resume_path' => $target, 'resume_original_name' => $source->resume_original_name]);
            }

            $this->workflow->recordStage($copy, null, 'applied', $actor->id, 'Put forward from the talent pool');
            $this->fit->rescore($copy, $job);

            return $copy;
        });
    }
}
