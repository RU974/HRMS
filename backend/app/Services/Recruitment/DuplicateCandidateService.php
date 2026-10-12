<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The same person applying for several roles shows up as several candidate rows. Two rows
 * belong to one person when they share an email address or a phone number within a company.
 */
class DuplicateCandidateService
{
    /**
     * Other applications by the same person, newest first.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function matchesFor(Candidate $candidate): Collection
    {
        $email = mb_strtolower(trim((string) $candidate->email));
        $phone = $candidate->phone_normalized;

        if ($email === '' && $phone === null) {
            return collect();
        }

        return Candidate::query()
            ->withoutGlobalScopes()
            ->where('company_id', $candidate->company_id)
            ->whereKeyNot($candidate->id)
            ->where(function (Builder $query) use ($email, $phone) {
                $query->whereRaw('LOWER(email) = ?', [$email]);

                if ($phone !== null) {
                    $query->orWhere('phone_normalized', $phone);
                }
            })
            ->with('jobOpening:id,title')
            ->latest('id')
            ->get()
            ->map(fn (Candidate $other) => [
                'id' => $other->id,
                'full_name' => $other->full_name,
                'email' => $other->email,
                'stage' => $other->stage,
                'status' => $other->status,
                'applied_at' => $other->applied_at?->toDateString(),
                'job_opening_id' => $other->job_opening_id,
                'job_title' => $other->jobOpening?->title,
                'talent_pool' => $other->talent_pool,
                'matched_on' => mb_strtolower(trim((string) $other->email)) === $email ? 'email' : 'phone',
            ])
            ->values();
    }

    /**
     * How many other applications each candidate on a page has, using a single query.
     *
     * @param  Collection<int, Candidate>  $candidates
     * @return array<int, int> candidate id => number of other applications
     */
    public function countsFor(Collection $candidates): array
    {
        if ($candidates->isEmpty()) {
            return [];
        }

        $emails = $candidates->map(fn (Candidate $candidate) => mb_strtolower(trim((string) $candidate->email)))->filter()->unique()->values()->all();
        $phones = $candidates->pluck('phone_normalized')->filter()->unique()->values()->all();
        $companies = $candidates->pluck('company_id')->unique()->values()->all();

        $pool = Candidate::query()
            ->withoutGlobalScopes()
            ->whereIn('company_id', array_filter($companies))
            ->where(function (Builder $query) use ($emails, $phones) {
                $query->where(function (Builder $inner) use ($emails) {
                    foreach (array_chunk($emails, 400) as $chunk) {
                        $inner->orWhereIn(DB::raw('LOWER(email)'), $chunk);
                    }
                });

                if ($phones) {
                    $query->orWhereIn('phone_normalized', $phones);
                }
            })
            ->get(['id', 'company_id', 'email', 'phone_normalized']);

        $counts = [];

        foreach ($candidates as $candidate) {
            $email = mb_strtolower(trim((string) $candidate->email));

            $counts[$candidate->id] = $pool->filter(fn (Candidate $other) => $other->id !== $candidate->id
                && (string) $other->company_id === (string) $candidate->company_id
                && (mb_strtolower(trim((string) $other->email)) === $email
                    || ($candidate->phone_normalized !== null && $other->phone_normalized === $candidate->phone_normalized)))->count();
        }

        return $counts;
    }

    /** Restrict a candidate query to rows that share an email or phone with another row of the same company. */
    public function scopeDuplicates(Builder $query): Builder
    {
        return $query->whereExists(function ($sub) {
            $sub->selectRaw('1')
                ->from('candidates as twin')
                ->whereColumn('twin.id', '!=', 'candidates.id')
                ->whereRaw('(twin.company_id = candidates.company_id OR (twin.company_id IS NULL AND candidates.company_id IS NULL))')
                ->whereRaw('(LOWER(twin.email) = LOWER(candidates.email) OR (candidates.phone_normalized IS NOT NULL AND twin.phone_normalized = candidates.phone_normalized))');
        });
    }
}
