<?php

namespace App\Services\Recruitment;

use Illuminate\Database\Eloquent\Builder;

/**
 * The one place that turns candidate-list filters into query constraints, so the table, the
 * board and "select everything matching this filter" can never disagree about who matches.
 */
class CandidateFilter
{
    /** Filters that can be sent in the body of a bulk request. */
    public const KEYS = [
        'job_opening_id', 'stage', 'status', 'source', 'skill', 'min_experience', 'min_fit', 'talent_pool',
        'duplicates', 'resume_q', 'tag', 'q',
    ];

    /**
     * @param  array<string, mixed>  $input
     * @param  array<int, string>  $except
     */
    public function apply(Builder $query, array $input, array $except = []): Builder
    {
        foreach (array_diff(['job_opening_id', 'stage', 'status', 'source', 'source_type', 'agency_id', 'referrer_employee_id'], $except) as $filter) {
            if ($this->filled($input, $filter)) {
                $query->where($filter, $input[$filter]);
            }
        }

        if (filter_var($input['knockout_failed'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $query->where('knockout_failed', true);
        }

        if ($this->filled($input, 'skill')) {
            $query->where('skills', 'like', '%"' . $this->escapeLike((string) $input['skill']) . '"%');
        }

        if ($this->filled($input, 'min_experience')) {
            $query->where('experience_years', '>=', (float) $input['min_experience']);
        }

        if ($this->filled($input, 'min_fit')) {
            $query->where('fit_score', '>=', (int) $input['min_fit']);
        }

        if ($this->filled($input, 'talent_pool')) {
            match ((string) $input['talent_pool']) {
                'any' => $query->whereNotNull('talent_pool'),
                'none' => $query->whereNull('talent_pool'),
                default => $query->where('talent_pool', (string) $input['talent_pool']),
            };
        }

        if (filter_var($input['duplicates'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            app(DuplicateCandidateService::class)->scopeDuplicates($query);
        }

        foreach ($this->keywords($input['resume_q'] ?? null) as $keyword) {
            $like = '%' . $keyword . '%';
            $query->where(function ($subQuery) use ($like) {
                $subQuery->where('resume_text', 'like', $like)
                    ->orWhere('skills', 'like', $like)
                    ->orWhere('full_name', 'like', $like);
            });
        }

        if ($this->filled($input, 'tag')) {
            $query->where('tags', 'like', '%"' . str_replace(['%', '_', '"'], '', (string) $input['tag']) . '"%');
        }

        if ($this->filled($input, 'q')) {
            $q = trim((string) $input['q']);
            $query->where(function ($subQuery) use ($q) {
                $subQuery->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('source', 'like', "%{$q}%");
            });
        }

        return $query;
    }

    /** Best-fit first (people with no score last), then newest. Anything else is newest first. */
    public function sort(Builder $query, ?string $sort): Builder
    {
        if ($sort === 'fit') {
            return $query->orderByRaw('fit_score IS NULL')->orderByDesc('fit_score')->orderByDesc('id');
        }

        return $query->latest('id');
    }

    /** @return array<int, string> every keyword must match (AND), quotes group a phrase */
    public function keywords(mixed $input): array
    {
        $input = trim((string) $input);

        if ($input === '') {
            return [];
        }

        preg_match_all('/"([^"]+)"|(\S+)/u', $input, $matches, PREG_SET_ORDER);

        return collect($matches)
            ->map(fn ($match) => trim($this->escapeLike($match[1] !== '' ? $match[1] : ($match[2] ?? ''))))
            ->filter(fn ($word) => mb_strlen($word) >= 2)
            ->unique()
            ->take(8)
            ->values()
            ->all();
    }

    /** LIKE wildcards and quotes are dropped rather than escaped so the query behaves the same on every database. */
    public function escapeLike(string $value): string
    {
        return str_replace(['%', '_', '"', chr(92)], '', $value);
    }

    /** @param  array<string, mixed>  $input */
    private function filled(array $input, string $key): bool
    {
        return isset($input[$key]) && trim((string) (is_scalar($input[$key]) ? $input[$key] : '')) !== '';
    }
}
