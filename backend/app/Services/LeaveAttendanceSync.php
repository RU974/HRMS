<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use Carbon\Carbon;

/**
 * Keeps attendance in step with leave. An approved leave owns one attendance row per
 * working day it covers (status "leave", or "half_day" for a half-day leave), tied back
 * through attendances.leave_id. Anything that changes a leave (approve, reject, cancel,
 * edit dates / type / half day, delete) calls sync() or release() so the rows follow.
 *
 * Real punches are never thrown away: a row with a check-in / check-out survives,
 * it just stops being tied to the leave.
 */
class LeaveAttendanceSync
{
    public function __construct(private AttendanceAbsenceService $days)
    {
    }

    /**
     * Make attendance match the leave's current state. Safe to call repeatedly.
     *
     * @return int number of attendance rows created, updated or removed
     */
    public function sync(Leave $leave): int
    {
        $employee = $leave->employee ?? Employee::query()->find($leave->employee_id);
        if (!$employee) {
            return 0;
        }

        $targets = $leave->status === 'approved' ? $this->workingDates($leave, $employee) : [];
        $changed = 0;

        Attendance::query()->where('leave_id', $leave->id)->get()->each(function (Attendance $row) use ($targets, $employee, &$changed) {
            if (!in_array(Carbon::parse($row->date)->toDateString(), $targets, true)) {
                $changed += $this->guarded(function () use ($row, $employee) {
                    $this->releaseRow($row, $employee);

                    return 1;
                });
            }
        });

        foreach ($targets as $date) {
            $changed += $this->guarded(fn () => $this->applyDay($leave, $employee, $date));
        }

        return $changed;
    }

    /**
     * Run one row's change as the leave sync. A day in a closed month (locked, or payroll already
     * run) is left as it is: the leave still stands, payroll reads approved leaves directly.
     */
    private function guarded(callable $change): int
    {
        try {
            return (int) Attendance::recordingAs('leave', $change, 'Approved leave sync');
        } catch (\App\Exceptions\AttendancePeriodLockedException $e) {
            \Illuminate\Support\Facades\Log::info('Leave attendance sync skipped: period closed', ['message' => $e->getMessage()]);

            return 0;
        }
    }

    /** Re-sync every approved leave of one employee (shift, joining date or status changed). */
    public function syncEmployee(Employee $employee): int
    {
        return $this->syncLeaves(Leave::query()->with('employee')->where('employee_id', $employee->id)->where('status', 'approved')->get());
    }

    /** Re-sync approved leaves of employees on a shift (its working days changed). */
    public function syncShift(int $shiftId): int
    {
        return $this->syncLeaves(
            Leave::query()->with('employee')->where('status', 'approved')
                ->whereHas('employee', fn ($q) => $q->where('shift_id', $shiftId))->get()
        );
    }

    /** Re-sync approved leaves of a company that cover a date (a holiday was added or removed). */
    public function syncCompanyDate(string $companyId, string $date): int
    {
        return $this->syncLeaves(
            Leave::query()->with('employee')->where('status', 'approved')
                ->whereDate('from_date', '<=', $date)->whereDate('to_date', '>=', $date)
                ->whereHas('employee', fn ($q) => $q->where('company_id', $companyId))->get()
        );
    }

    private function syncLeaves($leaves): int
    {
        $changed = 0;
        foreach ($leaves as $leave) {
            $changed += $this->sync($leave);
        }

        return $changed;
    }

    /** Remove the leave's attendance rows (call before the leave itself is deleted). */
    public function release(Leave $leave): int
    {
        $employee = $leave->employee ?? Employee::query()->find($leave->employee_id);
        $changed = 0;

        Attendance::query()->where('leave_id', $leave->id)->get()->each(function (Attendance $row) use ($employee, &$changed) {
            $changed += $this->guarded(function () use ($row, $employee) {
                $this->releaseRow($row, $employee);

                return 1;
            });
        });

        return $changed;
    }

    /** @return array<int, string> Y-m-d dates the leave actually takes the employee off work */
    public function workingDates(Leave $leave, Employee $employee): array
    {
        $from = Carbon::parse($leave->from_date)->startOfDay();
        // A half-day leave is half of one day, whatever to_date says.
        $to = $leave->half_day ? $from->copy() : Carbon::parse($leave->to_date)->startOfDay();
        if ($employee->joining_date && $from->lt(Carbon::parse($employee->joining_date)->startOfDay())) {
            $from = Carbon::parse($employee->joining_date)->startOfDay();
        }

        $holidays = Holiday::withoutGlobalScopes()
            ->where('company_id', $employee->company_id)
            ->where('is_optional', false)
            ->whereBetween('holiday_date', [$from->toDateString(), $to->toDateString()])
            ->pluck('holiday_date')
            ->map(fn ($d) => Carbon::parse($d)->toDateString())
            ->all();

        $dates = [];
        for ($day = $from->copy(); $day->lte($to); $day->addDay()) {
            if ($this->days->isWorkingDay($employee, $day) && !in_array($day->toDateString(), $holidays, true)) {
                $dates[] = $day->toDateString();
            }
        }

        return $dates;
    }

    private function applyDay(Leave $leave, Employee $employee, string $date): int
    {
        $status = $leave->half_day ? Attendance::STATUS_HALF_DAY : 'leave';
        $note = sprintf('%s leave%s (approved).', ucfirst((string) $leave->type), $leave->half_day ? ', half day' : '');

        $row = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereDate('date', $date)
            ->first();

        if (!$row) {
            Attendance::create([
                'employee_id' => $employee->id,
                'leave_id'    => $leave->id,
                'date'        => $date,
                'status'      => $status,
                'notes'       => $note,
            ]);

            return 1;
        }

        // Another approved leave already owns this day.
        if ($row->leave_id && (int) $row->leave_id !== (int) $leave->id) {
            return 0;
        }

        $hasPunches = $row->check_in || $row->check_out;
        // Someone who worked a full approved-leave day stays as they were recorded. The row
        // says so, so HR can decide whether the leave day should be given back.
        if ($hasPunches && !$leave->half_day) {
            $flag = sprintf('Worked on a day of approved %s leave (leave #%d); review whether to give the day back.', $leave->type, $leave->id);
            if ($row->notes !== $flag && !str_contains((string) $row->notes, 'approved ' . $leave->type . ' leave (leave #')) {
                $row->notes = trim(($row->notes ? $row->notes . ' ' : '') . $flag);
                $row->save();

                return 1;
            }

            return 0;
        }

        // An admin deliberately changed this leave-linked row (e.g. back to present): keep it.
        if ((int) $row->leave_id === (int) $leave->id && !in_array($row->status, ['leave', Attendance::STATUS_HALF_DAY, 'absent', null, ''], true)) {
            return 0;
        }

        $row->leave_id = $leave->id;
        $row->status = $status;
        if (!$row->notes || str_starts_with($row->notes, 'Auto-marked') || $row->notes === $note) {
            $row->notes = $note;
        }
        $dirty = $row->isDirty();
        $row->save();

        return $dirty ? 1 : 0;
    }

    private function releaseRow(Attendance $row, ?Employee $employee): void
    {
        $date = Carbon::parse($row->date);
        $hasPunches = $row->check_in || $row->check_out;

        if ($hasPunches) {
            // Keep the real punches; they go back to being judged on their own.
            $row->leave_id = null;
            if (in_array($row->status, ['leave', Attendance::STATUS_HALF_DAY], true)) {
                $row->status = 'present';
                $row->status = (new AttendanceCalculator())->recomputeStatus(
                    $row,
                    $employee ? \App\Models\AttendancePolicy::forEmployee($employee) : null,
                    $employee?->effectiveShift()
                );
            }
            $row->save();

            return;
        }

        if (in_array($row->status, ['leave', Attendance::STATUS_HALF_DAY], true)) {
            $row->delete();
            // The day is no longer covered: a finished working day goes back to being absent.
            if ($employee && $date->lt(Carbon::today())) {
                $this->days->markDay($date, $employee->company_id, $employee->id);
            }

            return;
        }

        // An admin changed the status by hand; just stop tying it to the leave.
        $row->leave_id = null;
        $row->save();
    }
}
