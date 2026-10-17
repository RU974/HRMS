<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use Carbon\CarbonInterface;

/**
 * Re-derives present/late/half-day/absent (and missing-punch) status from each record's own punches.
 * A record is judged against the shift it was frozen with (its snapshot), so editing a shift never
 * re-judges past days on its own. Pass $resnapshot to first re-capture the schedule of each record
 * (what a shift or grace change applied "from a date" does).
 */
class AttendanceStatusRecalculator
{
    /**
     * @param  int|null     $shiftId      limit to records on this shift (frozen, or the employee's default)
     * @param  string|null  $companyId    limit to employees of this company
     * @param  bool         $resnapshot   re-capture each record's shift from the current schedule first
     * @param  array|null   $employeeIds  limit to these employees
     * @return int number of records whose status (or frozen shift) changed
     */
    public function recalculate(CarbonInterface $from, ?CarbonInterface $to = null, ?int $shiftId = null, bool $apply = true, ?callable $onChange = null, ?string $companyId = null, bool $resnapshot = false, ?array $employeeIds = null): int
    {
        $calculator = new AttendanceCalculator();
        $guard = app(AttendancePeriodGuard::class);
        $changed = 0;

        Attendance::query()
            ->with('employee')
            ->whereDate('date', '>=', $from->toDateString())
            ->when($to, fn ($q) => $q->whereDate('date', '<=', $to->toDateString()))
            ->whereNotNull('check_in')
            // present / late, plus the half days and absences the policy itself worked out (hand-picked ones stay).
            ->where(fn ($q) => $q->whereIn('status', ['present', 'late'])->orWhere('status_reason', Attendance::REASON_POLICY))
            ->when($shiftId, fn ($q) => $q->where(fn ($w) => $w->where('shift_id', $shiftId)
                ->orWhereHas('employee', fn ($e) => $e->where('shift_id', $shiftId))))
            ->when($employeeIds !== null, fn ($q) => $q->whereIn('employee_id', $employeeIds))
            ->when($companyId, fn ($q) => $q->whereHas('employee', fn ($e) => $e->where('company_id', $companyId)))
            ->chunkById(200, function ($records) use ($calculator, $guard, $apply, $onChange, $resnapshot, &$changed) {
                foreach ($records as $record) {
                    if ($resnapshot) {
                        $record->captureShift();
                    }
                    $status = $calculator->recomputeStatus($record, AttendancePolicy::forEmployee($record->employee), $record->judgingShift());
                    if ($status === $record->status) {
                        if ($resnapshot && $apply && $record->isDirty('shift_snapshot')) {
                            $record->saveIfOpen('recalculation');
                        }
                        continue;
                    }
                    // A closed month (locked, or payroll already run) keeps its status and is not counted.
                    if ($apply && $guard->lockFor($record->employee_id, $record->date)) {
                        continue;
                    }
                    $onChange && $onChange($record, $status);
                    $changed++;
                    if ($apply) {
                        $record->status = $status;
                        $record->saveIfOpen('recalculation'); // the saving hook refreshes status_reason
                    }
                }
            });

        return $changed;
    }
}
