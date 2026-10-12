<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use App\Models\Company;
use App\Models\HeadcountBudget;
use App\Models\JobOpening;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Tracks how many hires and how much salary each department has been approved for in a year, and
 * how much of that is already used by hires, open jobs and requisitions awaiting approval.
 *
 * Budgets are set in the company's base currency. Jobs and accepted offers in other currencies are
 * converted with the company's own rates (see CurrencyService). A currency with no rate cannot be
 * converted: it is reported, left out of the totals, and sends the request to the Company Admin
 * rather than letting an unknown cost slip through.
 */
class HeadcountService
{
    public function __construct(private readonly CurrencyService $currencies)
    {
    }

    /** @return array<string, mixed> */
    public function check(JobOpening $job, ?int $year = null): array
    {
        $year ??= (int) now()->year;
        $companyId = $job->company_id;
        $requested = $this->remainingPositions($job);
        $unitCost = $this->unitCost($job);
        $unconverted = [];

        if ($unitCost === null) {
            $unconverted[] = strtoupper((string) $job->salary_currency);
            $unitCost = 0.0;
        }

        $estimated = round($unitCost * $requested, 2);

        $threshold = $companyId ? Company::query()->whereKey($companyId)->value('requisition_cost_threshold') : null;
        $highCost = $threshold !== null && $estimated > 0 && $estimated >= (float) $threshold;

        $budget = $job->department_id
            ? HeadcountBudget::query()->withoutGlobalScopes()->where('department_id', $job->department_id)->where('fiscal_year', $year)->first()
            : null;

        $result = [
            'fiscal_year' => $year,
            'department_id' => $job->department_id,
            'currency' => $this->currencies->baseCurrency($companyId),
            'requested_headcount' => $requested,
            'estimated_cost' => $estimated,
            'has_budget' => $budget !== null,
            'approved_headcount' => null,
            'approved_budget' => null,
            'used_headcount' => null,
            'used_cost' => null,
            'over_headcount' => false,
            'over_budget' => false,
            'high_cost' => $highCost,
            'cost_threshold' => $threshold !== null ? (float) $threshold : null,
        ];

        if ($budget) {
            $used = $this->usage((int) $job->department_id, $year, $job->id);
            $unconverted = array_merge($unconverted, $used['unconverted']);

            $result['approved_headcount'] = $budget->approved_headcount;
            $result['approved_budget'] = $budget->approved_budget !== null ? (float) $budget->approved_budget : null;
            $result['used_headcount'] = $used['headcount'];
            $result['used_cost'] = $used['cost'];
            $result['over_headcount'] = $used['headcount'] + $requested > $budget->approved_headcount;
            $result['over_budget'] = $budget->approved_budget !== null && $estimated > 0
                && $used['cost'] + $estimated > (float) $budget->approved_budget;
        }

        $result['unconverted_currencies'] = array_values(array_unique(array_filter($unconverted)));
        $result['requires_executive'] = $highCost || $result['over_headcount'] || $result['over_budget'] || $result['unconverted_currencies'] !== [];

        return $result;
    }

    /** Refresh the figures stored on a job (shown in lists and on the requisition). */
    public function refresh(JobOpening $job): JobOpening
    {
        $check = $this->check($job);

        $job->forceFill(['estimated_cost' => $check['estimated_cost'] ?: null, 'budget_check' => $check])->saveQuietly();

        return $job;
    }

    /**
     * One row per department that has a budget for the year.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function summary(string $companyId, int $year): Collection
    {
        return HeadcountBudget::query()->withoutGlobalScopes()
            ->where('company_id', $companyId)->where('fiscal_year', $year)
            ->with('department:id,name')
            ->get()
            ->map(function (HeadcountBudget $budget) use ($year) {
                $used = $this->usage((int) $budget->department_id, $year, null);
                $remainingHeadcount = $budget->approved_headcount - $used['headcount'];
                $remainingBudget = $budget->approved_budget !== null ? round((float) $budget->approved_budget - $used['cost'], 2) : null;

                return [
                    'id' => $budget->id,
                    'department_id' => $budget->department_id,
                    'department' => $budget->department?->name,
                    'fiscal_year' => $year,
                    'approved_headcount' => $budget->approved_headcount,
                    'approved_budget' => $budget->approved_budget !== null ? (float) $budget->approved_budget : null,
                    'hired' => $used['hired'],
                    'open_slots' => $used['open_slots'],
                    'used_headcount' => $used['headcount'],
                    'used_cost' => $used['cost'],
                    'remaining_headcount' => $remainingHeadcount,
                    'remaining_budget' => $remainingBudget,
                    'unconverted_currencies' => $used['unconverted'],
                    'over' => $remainingHeadcount < 0 || ($remainingBudget !== null && $remainingBudget < 0),
                ];
            })
            ->sortBy('department')
            ->values();
    }

    /**
     * Hires this year plus slots still open on live jobs and requisitions (optionally ignoring one
     * job), with money in the company's base currency.
     *
     * @return array{hired: int, open_slots: int, headcount: int, cost: float, unconverted: array<int, string>}
     */
    public function usage(int $departmentId, int $year, ?int $ignoreJobId): array
    {
        $start = now()->setYear($year)->startOfYear();
        $end = $start->copy()->endOfYear();

        $jobs = JobOpening::query()->withoutGlobalScopes()->where('department_id', $departmentId);
        $companyId = (clone $jobs)->value('company_id');
        $jobIds = (clone $jobs)->pluck('id');

        $hiredIds = CandidateStageHistory::query()->withoutGlobalScopes()
            ->where('to_stage', 'hired')->whereBetween('created_at', [$start, $end])
            ->whereIn('candidate_id', Candidate::query()->withoutGlobalScopes()->whereIn('job_opening_id', $jobIds)->select('id'))
            ->distinct()->pluck('candidate_id');

        $unconverted = [];
        $cost = 0.0;

        foreach (DB::table('offers')->whereIn('candidate_id', $hiredIds)->where('status', 'accepted')->get(['salary', 'currency']) as $offer) {
            $amount = $this->currencies->toBase($companyId, (float) $offer->salary, $offer->currency);
            $amount === null ? $unconverted[] = strtoupper((string) $offer->currency) : $cost += $amount;
        }

        $openSlots = 0;

        JobOpening::query()->withoutGlobalScopes()
            ->where('department_id', $departmentId)
            ->whereIn('status', ['open', 'pending_approval'])
            ->when($ignoreJobId, fn ($query) => $query->where('id', '!=', $ignoreJobId))
            ->withCount(['candidates as hired_count' => fn ($query) => $query->where('stage', 'hired')])
            ->get()
            ->each(function (JobOpening $job) use (&$openSlots, &$cost, &$unconverted) {
                $slots = max(0, (int) $job->open_positions - (int) $job->hired_count);
                $openSlots += $slots;
                $unit = $this->unitCost($job);

                $unit === null ? $unconverted[] = strtoupper((string) $job->salary_currency) : $cost += $slots * $unit;
            });

        return [
            'hired' => $hiredIds->count(),
            'open_slots' => $openSlots,
            'headcount' => $hiredIds->count() + $openSlots,
            'cost' => round($cost, 2),
            'unconverted' => array_values(array_unique($unconverted)),
        ];
    }

    public function remainingPositions(JobOpening $job): int
    {
        $hired = $job->exists
            ? Candidate::query()->withoutGlobalScopes()->where('job_opening_id', $job->id)->where('stage', 'hired')->count()
            : 0;

        return max(0, (int) $job->open_positions - $hired);
    }

    /** What one position costs in the company's base currency; null when its currency has no rate. */
    private function unitCost(JobOpening $job): ?float
    {
        $amount = (float) ($job->salary_max ?? $job->salary_min ?? 0);

        return $amount > 0 ? $this->currencies->toBase($job->company_id, $amount, $job->salary_currency) : 0.0;
    }
}
