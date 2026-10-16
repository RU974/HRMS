<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use Carbon\CarbonInterface;

/**
 * Re-derives present/late/half-day/absent (and missing-punch) status from each record's own punches
 * using the employee's current shift and department grace. Used after a shift or grace
 * period changes so records stamped "late" under the old grace are corrected.
 */
class AttendanceStatusRecalculator
{
    /**
     * @param  int|null     $shiftId    limit to employees on this shift
     * @param  string|null  $companyId  limit to employees of this company
     * @return int number of records whose status changed
     */
    public function recalculate(CarbonInterface $from, ?CarbonInterface $to = null, ?int $shiftId = null, bool $apply = true, ?callable $onChange = null, ?string $companyId = null): int
    {
        $calculator = new AttendanceCalculator();
        $changed = 0;

        Attendance::query()
            ->with('employee.shift')
            ->whereDate('date', '>=', $from->toDateString())
            ->when($to, fn ($q) => $q->whereDate('date', '<=', $to->toDateString()))
            ->whereNotNull('check_in')
            // present / late, plus the half days and absences the policy itself worked out (hand-picked ones stay).
            ->where(fn ($q) => $q->whereIn('status', ['present', 'late'])->orWhere('status_reason', Attendance::REASON_POLICY))
            ->when($shiftId, fn ($q) => $q->whereHas('employee', fn ($e) => $e->where('shift_id', $shiftId)))
            ->when($companyId, fn ($q) => $q->whereHas('employee', fn ($e) => $e->where('company_id', $companyId)))
            ->chunkById(200, function ($records) use ($calculator, $apply, $onChange, &$changed) {
                foreach ($records as $record) {
                    $status = $calculator->recomputeStatus($record, AttendancePolicy::forEmployee($record->employee), $record->employee?->effectiveShift());
                    if ($status === $record->status) {
                        continue;
                    }
                    $onChange && $onChange($record, $status);
                    $changed++;
                    if ($apply) {
                        $record->update(['status' => $status]); // the saving hook refreshes status_reason
                    }
                }
            });

        return $changed;
    }
}
