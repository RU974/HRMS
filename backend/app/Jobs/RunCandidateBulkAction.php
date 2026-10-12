<?php

namespace App\Jobs;

use App\Models\CandidateBulkRun;
use App\Services\Recruitment\CandidateBulkRunService;
use Illuminate\Foundation\Bus\Dispatchable;

/**
 * Finishes a filter-wide bulk candidate action. It is dispatched to run right after the HTTP
 * response is sent, so it works without a queue worker; the browser polls the run for progress.
 */
class RunCandidateBulkAction
{
    use Dispatchable;

    public function __construct(public readonly int $runId)
    {
    }

    public function handle(CandidateBulkRunService $runs): void
    {
        $run = CandidateBulkRun::query()->withoutGlobalScopes()->find($this->runId);

        if ($run) {
            $runs->execute($run);
        }
    }
}
