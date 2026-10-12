<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\JobOpening;
use App\Models\PipelineStage;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Per-job and company-wide pipelines.
 *
 * A custom stage ("Technical test", "Reference check") always belongs to one of the built-in categories
 * (applied, screening, interview, offer). Candidates keep `stage` = the category, so reports, offers,
 * bulk actions and the portal keep working unchanged, and `pipeline_stage_id` says which stage of the
 * category they are in. A job uses its own stages if it has any, otherwise the company default, otherwise
 * the built-in four.
 */
class PipelineService
{
    /**
     * @return Collection<int, array{id: ?int, name: string, category: string, is_skippable: bool, sort_order: int}>
     */
    public function builtIn(): Collection
    {
        return collect(PipelineStage::CATEGORIES)->values()->map(fn (string $category, int $index) => [
            'id' => null,
            'name' => ucfirst($category),
            'category' => $category,
            'is_skippable' => false,
            'sort_order' => $index,
        ]);
    }

    /** Rows saved for exactly this scope (a job, or the company default when $jobId is null). */
    public function own(?string $companyId, ?int $jobId): Collection
    {
        return PipelineStage::query()
            ->withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where('job_opening_id', $jobId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (PipelineStage $stage) => $this->present($stage))
            ->values();
    }

    /** @return array{scope: string, stages: Collection} */
    public function resolve(?string $companyId, ?int $jobId): array
    {
        if ($jobId) {
            $own = $this->own($companyId, $jobId);
            if ($own->isNotEmpty()) {
                return ['scope' => 'job', 'stages' => $own];
            }
        }

        $company = $this->own($companyId, null);
        if ($company->isNotEmpty()) {
            return ['scope' => 'company', 'stages' => $company];
        }

        return ['scope' => 'default', 'stages' => $this->builtIn()];
    }

    public function stagesFor(?string $companyId, ?int $jobId): Collection
    {
        return $this->resolve($companyId, $jobId)['stages'];
    }

    public function forCandidate(Candidate $candidate): Collection
    {
        return $this->stagesFor($candidate->company_id, $candidate->job_opening_id);
    }

    public function isCustom(?string $companyId, ?int $jobId): bool
    {
        return $this->resolve($companyId, $jobId)['scope'] !== 'default';
    }

    private function present(PipelineStage $stage): array
    {
        return [
            'id' => $stage->id,
            'name' => $stage->name,
            'category' => $stage->category,
            'is_skippable' => (bool) $stage->is_skippable,
            'sort_order' => (int) $stage->sort_order,
        ];
    }

    /**
     * Index of the stage a candidate is currently in, or null when they are hired or rejected.
     * A stored stage that no longer matches the candidate's category (the stage was moved by a bulk
     * action or the portal) is ignored in favour of the first stage of the category.
     */
    public function positionOf(Candidate $candidate, Collection $stages): ?int
    {
        return $this->positionOfStage($candidate->stage, $candidate->pipeline_stage_id, $stages);
    }

    public function positionOfStage(?string $category, ?int $pipelineStageId, Collection $stages): ?int
    {
        if (! in_array($category, PipelineStage::CATEGORIES, true)) {
            return null;
        }

        if ($pipelineStageId) {
            $index = $stages->search(fn (array $stage) => $stage['id'] === (int) $pipelineStageId && $stage['category'] === $category);
            if ($index !== false) {
                return $index;
            }
        }

        $index = $stages->search(fn (array $stage) => $stage['category'] === $category);

        return $index === false ? null : $index;
    }

    /** The stage a candidate would be placed in when moved to `$category` without naming a stage. */
    public function firstOfCategory(Collection $stages, string $category): ?array
    {
        return $stages->first(fn (array $stage) => $stage['category'] === $category);
    }

    /** Name of the stage the candidate is in, for display and history. */
    public function labelFor(Candidate $candidate, ?Collection $stages = null): string
    {
        if (in_array($candidate->stage, ['hired', 'rejected'], true)) {
            return ucfirst($candidate->stage);
        }

        $stages ??= $this->forCandidate($candidate);
        $index = $this->positionOf($candidate, $stages);

        return $index === null ? ucfirst((string) $candidate->stage) : $stages[$index]['name'];
    }

    /**
     * Restrict a candidate query to one column of the board. The first stage of a category also holds
     * candidates that have no (or a stale) stage id.
     */
    public function scopeToStage($query, Collection $stages, int $index)
    {
        $stage = $stages[$index];
        $query->where('stage', $stage['category']);

        // Without custom ids (built-in pipeline) a category is one column.
        if ($stage['id'] === null) {
            return $query;
        }

        $sameCategory = $stages->where('category', $stage['category']);
        $isFirst = $sameCategory->keys()->first() === $index;

        if (! $isFirst) {
            return $query->where('pipeline_stage_id', $stage['id']);
        }

        $others = $sameCategory->reject(fn (array $other, int $key) => $key === $index)->pluck('id')->filter()->all();

        return $others === [] ? $query : $query->where(function ($inner) use ($others) {
            $inner->whereNull('pipeline_stage_id')->orWhereNotIn('pipeline_stage_id', $others);
        });
    }

    /**
     * Replace the stages of a scope.
     *
     * @param  array<int, array{id?: int|null, name: string, category: string, is_skippable?: bool}>  $input
     */
    public function save(?string $companyId, ?int $jobId, array $input): Collection
    {
        $rows = collect($input)->values()->map(fn (array $row, int $index) => [
            'id' => isset($row['id']) ? (int) $row['id'] : null,
            'name' => trim((string) ($row['name'] ?? '')),
            'category' => (string) ($row['category'] ?? ''),
            'is_skippable' => (bool) ($row['is_skippable'] ?? false),
            'sort_order' => $index,
        ]);

        $this->validate($rows);

        return DB::transaction(function () use ($companyId, $jobId, $rows) {
            $existing = PipelineStage::query()
                ->withoutGlobalScopes()
                ->where('company_id', $companyId)
                ->where('job_opening_id', $jobId)
                ->get()
                ->keyBy('id');

            $keptIds = [];

            foreach ($rows as $row) {
                $model = $row['id'] ? $existing->get($row['id']) : null;

                if ($row['id'] && ! $model) {
                    throw ValidationException::withMessages(['stages' => ['One of the stages does not belong to this pipeline.']]);
                }

                $attributes = [
                    'company_id' => $companyId,
                    'job_opening_id' => $jobId,
                    'name' => $row['name'],
                    'category' => $row['category'],
                    'sort_order' => $row['sort_order'],
                    'is_skippable' => $row['is_skippable'],
                ];

                if ($model) {
                    $model->update($attributes);
                } else {
                    $model = PipelineStage::query()->withoutGlobalScopes()->create($attributes);
                }

                $keptIds[] = $model->id;
            }

            // Candidates in a removed stage move to the first remaining stage of the same category.
            foreach ($existing->except($keptIds) as $removed) {
                $replacement = $rows->first(fn (array $row) => $row['category'] === $removed->category);
                $replacementId = $replacement
                    ? PipelineStage::query()->withoutGlobalScopes()->where('company_id', $companyId)->where('job_opening_id', $jobId)->where('sort_order', $replacement['sort_order'])->value('id')
                    : null;

                Candidate::query()->withoutGlobalScopes()->where('pipeline_stage_id', $removed->id)->update(['pipeline_stage_id' => $replacementId]);
                $removed->delete();
            }

            return $this->own($companyId, $jobId);
        });
    }

    /** Back to the inherited pipeline; candidates fall back to the first stage of their category. */
    public function reset(?string $companyId, ?int $jobId): void
    {
        DB::transaction(function () use ($companyId, $jobId) {
            $ids = PipelineStage::query()->withoutGlobalScopes()->where('company_id', $companyId)->where('job_opening_id', $jobId)->pluck('id');

            Candidate::query()->withoutGlobalScopes()->whereIn('pipeline_stage_id', $ids)->update(['pipeline_stage_id' => null]);
            PipelineStage::query()->withoutGlobalScopes()->whereIn('id', $ids)->delete();
        });
    }

    private function validate(Collection $rows): void
    {
        if ($rows->count() < 4 || $rows->count() > 15) {
            throw ValidationException::withMessages(['stages' => ['A pipeline needs between 4 and 15 stages.']]);
        }

        foreach ($rows as $row) {
            if ($row['name'] === '' || mb_strlen($row['name']) > 80) {
                throw ValidationException::withMessages(['stages' => ['Every stage needs a name of up to 80 characters.']]);
            }

            if (! in_array($row['category'], PipelineStage::CATEGORIES, true)) {
                throw ValidationException::withMessages(['stages' => ['Every stage must belong to Applied, Screening, Interview or Offer.']]);
            }
        }

        $names = $rows->pluck('name')->map(fn ($name) => mb_strtolower($name));
        if ($names->unique()->count() !== $names->count()) {
            throw ValidationException::withMessages(['stages' => ['Stage names must be unique.']]);
        }

        $missing = collect(PipelineStage::CATEGORIES)->reject(fn (string $category) => $rows->contains('category', $category));
        if ($missing->isNotEmpty()) {
            throw ValidationException::withMessages(['stages' => ['The pipeline needs at least one stage in each of: ' . $missing->map(fn ($category) => ucfirst($category))->implode(', ') . '. Mark a stage as skippable if it is not always needed.']]);
        }

        $order = array_flip(PipelineStage::CATEGORIES);
        $previous = -1;
        foreach ($rows as $row) {
            if ($order[$row['category']] < $previous) {
                throw ValidationException::withMessages(['stages' => ['Stages must stay in order: Applied, then Screening, then Interview, then Offer.']]);
            }
            $previous = $order[$row['category']];
        }

        if ($rows->first()['category'] !== 'applied' || $rows->first()['is_skippable']) {
            throw ValidationException::withMessages(['stages' => ['The first stage must be an Applied stage and cannot be skippable.']]);
        }
    }

    /** Remove any custom pipeline when a job is deleted (the database also cascades). */
    public function forgetJob(JobOpening $job): void
    {
        $this->reset($job->company_id, $job->id);
    }
}
