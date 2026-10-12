<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateBulkRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * "Select everything matching this filter": the matching candidates are resolved on the server,
 * so the action is not limited to the page on screen or to the 200 ids a request can carry.
 * Small selections run immediately; large ones are recorded as a run that finishes after the
 * response and reports its progress.
 */
class CandidateBulkRunService
{
    /** Most candidates one filter-wide action may touch. */
    public const MAX_MATCHING = 5000;

    /** Emails are capped lower: each one is a message to a real person. */
    public const MAX_MATCHING_EMAILS = 500;

    /** Matches up to this many are handled inside the request. */
    public const INLINE_LIMIT = 200;

    private const MAX_RECORDED_FAILURES = 200;

    public function __construct(
        private readonly CandidateFilter $filter,
        private readonly CandidateBulkService $bulk,
    ) {
    }

    /** The candidate ids a filter currently selects, minus the ones the user unticked. */
    public function matchingQuery(?string $companyId, array $filters, array $excludeIds): Builder
    {
        $query = Candidate::query()->withoutGlobalScopes();

        if ($companyId !== null) {
            $query->where('candidates.company_id', $companyId);
        }

        $this->filter->apply($query, $filters);

        if ($excludeIds) {
            $query->whereNotIn('candidates.id', array_map('intval', $excludeIds));
        }

        return $query;
    }

    public function countMatching(User $actor, array $filters, array $excludeIds): int
    {
        return $this->matchingQuery($actor->company_id, $filters, $excludeIds)->count();
    }

    /**
     * @param  array<string, mixed>  $filters
     * @param  array<int, int>  $excludeIds
     * @param  array<string, mixed>  $params
     * @return array{mode: 'inline', result: array<string, mixed>}|array{mode: 'run', run: CandidateBulkRun}
     */
    public function start(User $actor, string $action, array $params, array $filters, array $excludeIds): array
    {
        $total = $this->countMatching($actor, $filters, $excludeIds);

        if ($total === 0) {
            throw ValidationException::withMessages(['filters' => ['No candidates match this filter.']]);
        }

        $cap = $action === 'email' ? self::MAX_MATCHING_EMAILS : self::MAX_MATCHING;

        if ($total > $cap) {
            throw ValidationException::withMessages(['filters' => [sprintf(
                '%d candidates match, but %s at most %d at a time. Narrow the filter first.',
                $total,
                $action === 'email' ? 'you can email' : 'an action can change',
                $cap
            )]]);
        }

        if ($total <= self::INLINE_LIMIT) {
            $ids = $this->matchingQuery($actor->company_id, $filters, $excludeIds)->orderBy('candidates.id')->pluck('candidates.id')->all();

            return ['mode' => 'inline', 'result' => $this->bulk->run($ids, $action, $params, $actor)];
        }

        $run = CandidateBulkRun::query()->withoutGlobalScopes()->create([
            'company_id' => $actor->company_id,
            'user_id' => $actor->id,
            'action' => $action,
            'params' => $params,
            'filters' => $filters,
            'exclude_ids' => $excludeIds,
            'status' => 'queued',
            'total' => $total,
        ]);

        return ['mode' => 'run', 'run' => $run];
    }

    /** Work through a recorded run in batches, keeping the progress up to date. */
    public function execute(CandidateBulkRun $run): void
    {
        if ($run->status !== 'queued') {
            return;
        }

        $actor = User::query()->find($run->user_id);

        if (! $actor) {
            $run->update(['status' => 'failed', 'finished_at' => now(), 'failed' => [['id' => 0, 'name' => null, 'reason' => 'The user who started this action no longer exists.']]]);

            return;
        }

        @set_time_limit(0);
        Auth::setUser($actor);
        $run->update(['status' => 'running']);

        $failures = [];
        $succeeded = 0;
        $processed = 0;

        try {
            $ids = $this->matchingQuery($run->company_id, $run->filters ?? [], $run->exclude_ids ?? [])
                ->orderBy('candidates.id')->pluck('candidates.id')->all();

            foreach (array_chunk($ids, 50) as $batch) {
                $result = $this->bulk->run($batch, $run->action, $run->params ?? [], $actor);

                $succeeded += count($result['succeeded']);
                $processed += count($batch);
                $failures = array_slice(array_merge($failures, $result['failed']), 0, self::MAX_RECORDED_FAILURES);

                $run->update(['processed' => $processed, 'succeeded_count' => $succeeded, 'failed' => $failures]);
            }

            $run->update(['status' => 'done', 'finished_at' => now(), 'total' => max($run->total, $processed)]);
        } catch (Throwable $exception) {
            report($exception);
            $run->update(['status' => 'failed', 'finished_at' => now()]);
        }
    }

    /** @return array<string, mixed> */
    public function present(CandidateBulkRun $run): array
    {
        return [
            'id' => $run->id,
            'action' => $run->action,
            'status' => $run->status,
            'total' => $run->total,
            'processed' => $run->processed,
            'succeeded' => $run->succeeded_count,
            'failed_count' => max(0, $run->processed - $run->succeeded_count),
            'failed' => $run->failed ?? [],
            'finished_at' => $run->finished_at?->toIso8601String(),
        ];
    }
}
