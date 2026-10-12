<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateNote;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Combines duplicate applications of one person into a single record. Everything that belongs to
 * the merged application (interviews, notes, documents, offers, history, messages) moves to the
 * record that is kept, so nothing the team wrote or the candidate uploaded is lost.
 */
class DuplicateMergeService
{
    /** Child tables that point at a candidate and simply follow the person to the kept record. */
    private const CHILD_TABLES = [
        'interviews',
        'candidate_notes',
        'candidate_stage_histories',
        'offers',
        'candidate_documents',
        'candidate_messages',
        'interview_reschedule_requests',
        'candidate_answers',
        'candidate_checks',
    ];

    public function __construct(
        private readonly DuplicateCandidateService $duplicates,
        private readonly ResumeStorageService $resumes,
        private readonly FitScoringService $fit,
    ) {
    }

    /**
     * @param  array<int, int>  $mergeIds  candidate ids folded into $keep
     */
    public function merge(Candidate $keep, array $mergeIds, User $actor): Candidate
    {
        $mergeIds = array_values(array_unique(array_map('intval', $mergeIds)));
        $mergeIds = array_values(array_diff($mergeIds, [$keep->id]));

        if (! $mergeIds) {
            throw ValidationException::withMessages(['merge_ids' => ['Choose at least one other application to merge.']]);
        }

        $knownDuplicates = $this->duplicates->matchesFor($keep)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $others = Candidate::query()->whereIn('id', $mergeIds)->with('jobOpening:id,title')->get();

        if ($others->count() !== count($mergeIds)) {
            throw ValidationException::withMessages(['merge_ids' => ['One of the selected applications could not be found.']]);
        }

        foreach ($others as $other) {
            if (! in_array($other->id, $knownDuplicates, true)) {
                throw ValidationException::withMessages(['merge_ids' => [$other->full_name . ' is not a duplicate of this candidate (no shared email or phone).']]);
            }

            if ($other->employee_id || $other->stage === 'hired') {
                throw ValidationException::withMessages(['merge_ids' => [$other->full_name . ' was hired, so that application cannot be merged away.']]);
            }
        }

        $this->assertOffersDoNotClash($keep, $others->all());

        return DB::transaction(function () use ($keep, $others, $actor) {
            $merged = $keep->merged_from ?? [];

            foreach ($others as $other) {
                $merged[] = [
                    'id' => $other->id,
                    'full_name' => $other->full_name,
                    'email' => $other->email,
                    'job_opening_id' => $other->job_opening_id,
                    'job_title' => $other->jobOpening?->title,
                    'stage' => $other->stage,
                    'applied_at' => $other->applied_at?->toDateString(),
                    'merged_at' => now()->toIso8601String(),
                    'merged_by' => $actor->id,
                ];

                $this->absorb($keep, $other);

                foreach (self::CHILD_TABLES as $table) {
                    DB::table($table)->where('candidate_id', $other->id)->update(['candidate_id' => $keep->id]);
                }

                // One referral record per person: the kept one wins, otherwise the merged one follows.
                if (! DB::table('referral_bonuses')->where('candidate_id', $keep->id)->exists()) {
                    DB::table('referral_bonuses')->where('candidate_id', $other->id)->update(['candidate_id' => $keep->id]);
                }

                // The kept record may have adopted the resume file; only remove it when it did not.
                if ($other->resume_path && $other->resume_path !== $keep->resume_path) {
                    $this->resumes->delete($other);
                }

                $other->delete();

                CandidateNote::create([
                    'company_id' => $keep->company_id,
                    'candidate_id' => $keep->id,
                    'user_id' => $actor->id,
                    'body' => sprintf('Merged a duplicate application (%s, %s stage) into this record.', $other->jobOpening?->title ?? 'unknown job', $other->stage),
                ]);
            }

            $keep->update(['merged_from' => $merged]);
            $this->fit->rescore($keep->refresh());

            return $keep->refresh();
        });
    }

    /** Fill gaps on the kept record from the merged one; nothing already on the kept record is overwritten. */
    private function absorb(Candidate $keep, Candidate $other): void
    {
        $updates = [];

        foreach (['phone', 'resume_text', 'resume_parsed', 'experience_years', 'rating'] as $field) {
            if (blank($keep->{$field}) && filled($other->{$field})) {
                $updates[$field] = $other->{$field};
            }
        }

        if (blank($keep->resume_path) && filled($other->resume_path)) {
            $updates['resume_path'] = $other->resume_path;
            $updates['resume_original_name'] = $other->resume_original_name;
        }

        $tags = array_values(array_unique(array_merge($keep->tags ?? [], $other->tags ?? [])));
        $skills = array_values(array_unique(array_merge($keep->skills ?? [], $other->skills ?? [])));

        if ($tags !== ($keep->tags ?? [])) {
            $updates['tags'] = array_slice($tags, 0, 20);
        }

        if ($skills !== ($keep->skills ?? [])) {
            $updates['skills'] = array_slice($skills, 0, 40);
        }

        if (blank($keep->source_type) && filled($other->source_type)) {
            foreach (['source_type', 'referrer_employee_id', 'agency_id'] as $field) {
                $updates[$field] = $other->{$field};
            }
        }

        if ($other->knockout_failed && ! $keep->knockout_failed) {
            $updates['knockout_failed'] = true;
        }

        if (blank($keep->talent_pool) && filled($other->talent_pool)) {
            foreach (['talent_pool', 'talent_pool_note', 'talent_pool_added_at', 'talent_pool_expires_at', 'pool_consent', 'pool_consent_at', 'pool_consent_requested_at'] as $field) {
                $updates[$field] = $other->{$field};
            }
        }

        if (filled($other->notes)) {
            $updates['notes'] = trim(($keep->notes ? $keep->notes . "\n\n" : '') . $other->notes);
        }

        if ($updates) {
            $keep->update($updates);
        }
    }

    /** @param  array<int, Candidate>  $others */
    private function assertOffersDoNotClash(Candidate $keep, array $others): void
    {
        $live = fn (Candidate $candidate) => $candidate->offers()->whereIn('status', ['pending_approval', 'approved', 'sent', 'accepted'])->exists();

        $withLiveOffer = collect($others)->filter($live)->count() + ($live($keep) ? 1 : 0);

        if ($withLiveOffer > 1) {
            throw ValidationException::withMessages(['merge_ids' => ['More than one of these applications has an offer in progress. Withdraw the extra offer before merging.']]);
        }
    }
}
