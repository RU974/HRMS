<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\JobOpening;
use Illuminate\Support\Collection;

/**
 * Scores how well a resume matches what a job asks for, so applicants can be ranked.
 *
 * The score is transparent rather than clever: required skills are read out of the job text with
 * the same dictionary used for resumes, and required years of experience are compared with the
 * candidate's. Skills weigh 70, experience 30; a part the job does not specify is left out and
 * the rest is rescaled. A candidate with no readable resume has no score, never a zero.
 */
class FitScoringService
{
    private const SKILL_WEIGHT = 70;

    private const EXPERIENCE_WEIGHT = 30;

    public function __construct(private readonly ResumeParserService $parser)
    {
    }

    /**
     * What a job asks for, derived from its text.
     *
     * @return array{skills: array<int, string>, years: ?float, keywords: array<int, string>}
     */
    public function requirementsOf(JobOpening $job): array
    {
        $text = trim(implode("\n", array_filter([$job->requirements, $job->description])));
        $skills = $this->parser->skillsIn(implode("\n", array_filter([$job->title, $text])));

        return [
            'skills' => $skills,
            'years' => $this->requiredYears($job->requirements ?: $job->description),
            'keywords' => $this->titleKeywords((string) $job->title),
        ];
    }

    /** @return array{score: ?int, breakdown: array<string, mixed>} */
    public function score(Candidate $candidate, JobOpening $job): array
    {
        $required = $this->requirementsOf($job);

        $haystack = mb_strtolower((string) $candidate->resume_text);
        // Word-boundary matching (the parser's dictionary) so "API" does not match "capital".
        $candidateSkills = collect($candidate->skills ?? [])
            ->merge($haystack !== '' ? $this->parser->skillsIn((string) $candidate->resume_text) : [])
            ->map(fn ($skill) => mb_strtolower((string) $skill))->unique()->values();

        if ($haystack === '' && $candidateSkills->isEmpty()) {
            return ['score' => null, 'breakdown' => ['reason' => 'no_resume']];
        }

        $components = [];
        $matched = [];
        $missing = [];

        if ($required['skills']) {
            foreach ($required['skills'] as $skill) {
                $needle = mb_strtolower($skill);
                $has = $candidateSkills->contains($needle);

                if ($has) {
                    $matched[] = $skill;
                } else {
                    $missing[] = $skill;
                }
            }

            $components['skills'] = [count($matched) / count($required['skills']), self::SKILL_WEIGHT];
        } elseif ($required['keywords'] && $haystack !== '') {
            // The job names no recognisable skills, so fall back to the words of its title.
            $hits = array_values(array_filter($required['keywords'], fn (string $word) => str_contains($haystack, $word)));
            $components['skills'] = [count($hits) / count($required['keywords']), self::SKILL_WEIGHT];
            $matched = $hits;
            $missing = array_values(array_diff($required['keywords'], $hits));
        }

        if ($required['years'] !== null && $required['years'] > 0) {
            $years = $candidate->experience_years;
            $components['experience'] = [$years === null ? 0.0 : min(1.0, (float) $years / $required['years']), self::EXPERIENCE_WEIGHT];
        }

        if (! $components) {
            return ['score' => null, 'breakdown' => ['reason' => 'no_requirements']];
        }

        $weight = array_sum(array_column($components, 1));
        $score = (int) round(100 * array_sum(array_map(fn ($component) => $component[0] * $component[1], $components)) / $weight);

        return [
            'score' => max(0, min(100, $score)),
            'breakdown' => [
                'matched_skills' => $matched,
                'missing_skills' => $missing,
                'required_years' => $required['years'],
                'candidate_years' => $candidate->experience_years,
                'skills_match' => isset($components['skills']) ? round($components['skills'][0], 2) : null,
                'experience_match' => isset($components['experience']) ? round($components['experience'][0], 2) : null,
            ],
        ];
    }

    /** Score one candidate against their own job (or the given one) and store the result. */
    public function rescore(Candidate $candidate, ?JobOpening $job = null): Candidate
    {
        $job ??= JobOpening::query()->withoutGlobalScopes()->find($candidate->job_opening_id);

        if (! $job) {
            return $candidate;
        }

        $result = $this->score($candidate, $job);

        $candidate->forceFill([
            'fit_score' => $result['score'],
            'fit_breakdown' => $result['breakdown'],
            'fit_scored_at' => now(),
        ])->saveQuietly();

        return $candidate;
    }

    /** Re-score everyone who applied for a job, after its requirements changed. */
    public function rescoreJob(JobOpening $job): int
    {
        $count = 0;

        Candidate::query()->withoutGlobalScopes()->where('job_opening_id', $job->id)
            ->chunkById(100, function ($candidates) use ($job, &$count) {
                foreach ($candidates as $candidate) {
                    $this->rescore($candidate, $job);
                    $count++;
                }
            });

        return $count;
    }

    /**
     * Talent-pool people who suit an opening, best fit first. People who declined to be kept on file,
     * whose pool entry has expired, or who already applied for this job are never suggested.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function suggestFromPool(JobOpening $job, int $limit = 10, int $minimum = 30): Collection
    {
        $alreadyApplied = Candidate::query()->withoutGlobalScopes()
            ->where('company_id', $job->company_id)->where('job_opening_id', $job->id)
            ->pluck('email')->map(fn ($email) => mb_strtolower(trim((string) $email)))->all();

        return Candidate::query()->withoutGlobalScopes()
            ->where('company_id', $job->company_id)
            ->whereNotNull('talent_pool')
            ->whereNull('anonymized_at')
            ->where(fn ($query) => $query->whereNull('pool_consent')->orWhere('pool_consent', '!=', 'declined'))
            ->where(fn ($query) => $query->whereNull('talent_pool_expires_at')->orWhere('talent_pool_expires_at', '>', now()))
            ->where('job_opening_id', '!=', $job->id)
            ->with('jobOpening:id,title')
            ->get()
            ->reject(fn (Candidate $candidate) => in_array(mb_strtolower(trim($candidate->email)), $alreadyApplied, true))
            ->map(function (Candidate $candidate) use ($job) {
                $result = $this->score($candidate, $job);

                return [
                    'id' => $candidate->id,
                    'full_name' => $candidate->full_name,
                    'email' => $candidate->email,
                    'talent_pool' => $candidate->talent_pool,
                    'pool_consent' => $candidate->pool_consent,
                    'previous_job_title' => $candidate->jobOpening?->title,
                    'skills' => $candidate->skills ?? [],
                    'experience_years' => $candidate->experience_years,
                    'fit_score' => $result['score'],
                    'matched_skills' => $result['breakdown']['matched_skills'] ?? [],
                ];
            })
            ->filter(fn (array $row) => $row['fit_score'] !== null && $row['fit_score'] >= $minimum)
            ->sortByDesc('fit_score')
            ->take($limit)
            ->values();
    }

    private function requiredYears(?string $text): ?float
    {
        if (! $text) {
            return null;
        }

        if (preg_match_all('/(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:years?|yrs?)\b/i', $text, $matches)) {
            $years = array_filter(array_map('floatval', $matches[1]), fn ($year) => $year > 0 && $year <= 40);

            return $years ? max($years) : null;
        }

        return null;
    }

    /** @return array<int, string> */
    private function titleKeywords(string $title): array
    {
        $stop = ['senior', 'junior', 'lead', 'the', 'and', 'for', 'jr', 'sr'];

        return collect(preg_split('/[^\p{L}\p{N}+#.]+/u', mb_strtolower($title)) ?: [])
            ->filter(fn ($word) => mb_strlen($word) >= 3 && ! in_array($word, $stop, true))
            ->unique()->values()->all();
    }
}
