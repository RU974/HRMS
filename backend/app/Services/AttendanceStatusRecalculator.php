<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use Carbon\CarbonInterface;

/**
 * Re-derives present/late (and missing-punch) status from each record's own punches
 * using the employee's current shift and department grace. Used after a shift or grace
 * period changes so records stamped "late" under the old grace are corrected.
 */
class AttendanceStatusRecalculator
{
    /**
     * @param  int|null  $shiftId  limit to employees on this shift
     * @return int number of records whose status changed
     */
    public function recalculate(CarbonInterface $from, ?CarbonInterface $to = null, ?int $shiftId = null, bool $apply = true, ?callable $onChange = null): int
    {
        $calculator = new AttendanceCalculator();
        $policy = AttendancePolicy::query()->first();
        $changed = 0;

        Attendance::query()
            ->with('employee.shift')
            ->whereDate('date', '>=', $from->toDateString())
            ->when($to, fn ($q) => $q->whereDate('date', '<=', $to->toDateString()))
            ->whereNotNull('check_in')
            ->whereIn('status', ['present', 'late'])
            ->when($shiftId, fn ($q) => $q->whereHas('employee', fn ($e) => $e->where('shift_id', $shiftId)))
            ->chunkById(200, function ($records) use ($calculator, $policy, $apply, $onChange, &$changed) {
                foreach ($records as $record) {
                    $status = $calculator->recomputeStatus($record, $policy, $record->employee?->effectiveShift());
                    if ($status === $record->status) {
                        continue;
                    }
                    $onChange && $onChange($record, $status);
                    $changed++;
                    if ($apply) {
                        $record->update(['status' => $status]);
                    }
                }
            });

        return $changed;
    }
}
