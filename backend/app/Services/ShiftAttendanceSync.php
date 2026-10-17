<?php

namespace App\Services;

use App\Models\Attendance;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Arr;

/**
 * Brings attendance records in line with a changed schedule. A record keeps the shift it was made
 * under (attendances.shift_snapshot), so a roster, rotation, swap, override or shift edit only
 * reaches records of the dates it is applied to: today and later by default, an earlier date only
 * when somebody asks for it (an override on a past day, "apply from" on a shift edit).
 *
 * For the affected records it
 *   1. re-syncs approved leave (a day off or a new working day changes which days a leave covers),
 *   2. re-captures the snapshot (and drops an "auto-absent" row that fell on a day that is now off),
 *   3. re-derives present / late / half day from the punches against the new shift,
 *   4. marks finished working days that now have no record as absent.
 */
class ShiftAttendanceSync
{
    /** Longest stretch of past days one call re-judges, so a typo cannot rewrite a year. */
    public const MAX_PAST_DAYS = 120;

    public function __construct(
        private ShiftResolver $resolver,
        private AttendanceStatusRecalculator $recalculator,
        private AttendanceAbsenceService $absences,
        private LeaveAttendanceSync $leaves,
    ) {
    }

    /**
     * @param  array<int>|null  $employeeIds  null = everyone (optionally of $companyId)
     * @return array{snapshots: int, removed: int, statuses: int, absences: int}
     */
    public function refresh(?array $employeeIds, CarbonInterface $from, ?CarbonInterface $to = null, ?int $shiftId = null, ?string $companyId = null): array
    {
        $from = Carbon::parse($from)->startOfDay()->max(Carbon::today()->subDays(self::MAX_PAST_DAYS));
        $to = $to ? Carbon::parse($to)->startOfDay() : null;
        $result = ['snapshots' => 0, 'removed' => 0, 'statuses' => 0, 'absences' => 0];
        if ($to && $to->lt($from)) {
            return $result;
        }

        $this->resolver->flush();

        if ($employeeIds !== null) {
            foreach (\App\Models\Employee::withoutGlobalScopes()->whereIn('id', $employeeIds)->get() as $employee) {
                $this->leaves->syncEmployee($employee);
            }
        } elseif ($shiftId === null) {
            foreach (\App\Models\Employee::withoutGlobalScopes()->when($companyId, fn ($q) => $q->where('company_id', $companyId))->get() as $employee) {
                $this->leaves->syncEmployee($employee);
            }
        }

        $rows = Attendance::query()
            ->with('employee')
            ->whereDate('date', '>=', $from->toDateString())
            ->when($to, fn ($q) => $q->whereDate('date', '<=', $to->toDateString()))
            ->when($employeeIds !== null, fn ($q) => $q->whereIn('employee_id', $employeeIds))
            ->when($companyId, fn ($q) => $q->whereHas('employee', fn ($e) => $e->where('company_id', $companyId)))
            ->when($shiftId, fn ($q) => $q->where(fn ($w) => $w->where('shift_id', $shiftId)
                ->orWhereHas('employee', fn ($e) => $e->where('shift_id', $shiftId))));

        $rows->chunkById(200, function ($records) use (&$result) {
            $this->resolver->preload($records->pluck('employee')->filter(), $records->min('date'), $records->max('date'));

            foreach ($records as $record) {
                if (!$record->employee) {
                    continue;
                }

                $schedule = $this->resolver->on($record->employee, $record->date);

                // An auto-generated absence on a day that is no longer a working day was never real.
                if (!$record->check_in && !$record->check_out && $record->status === 'absent'
                    && !$record->leave_id && str_starts_with((string) $record->notes, 'Auto-marked')
                    && !$schedule->isWorkingDay) {
                    if ($record->deleteIfOpen('schedule')) {
                        $result['removed']++;
                    }
                    continue;
                }

                $new = $schedule->toSnapshot();
                $old = is_array($record->shift_snapshot) ? $record->shift_snapshot : [];
                if (Arr::except($new, ['captured_at']) != Arr::except($old, ['captured_at'])) {
                    $record->captureShift($schedule);
                    if ($record->saveIfOpen('schedule')) {
                        $result['snapshots']++;
                    }
                }
            }
        });

        $result['statuses'] = $this->recalculator->recalculate(
            $from, $to, $shiftId, true, null, $companyId, false, $employeeIds
        );

        $lastPast = Carbon::yesterday();
        $absentTo = $to ? $to->copy()->min($lastPast) : $lastPast;
        if ($absentTo->gte($from)) {
            if ($employeeIds === null) {
                $result['absences'] = $this->absences->markAbsences($from, $absentTo, $companyId);
            } else {
                foreach (\App\Models\Employee::withoutGlobalScopes()->whereIn('id', $employeeIds)->get() as $employee) {
                    for ($day = $from->copy(); $day->lte($absentTo); $day->addDay()) {
                        $result['absences'] += $this->absences->markDay($day, $employee->company_id, (int) $employee->id);
                    }
                }
            }
        }

        return $result;
    }
}
