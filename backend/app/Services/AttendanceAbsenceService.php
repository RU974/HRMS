<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Shift;
use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * Marks employees absent for a finished working day when they neither have an
 * approved leave nor any check-in / check-out. Weekly off days (anything not in
 * the shift's working_days) and company holidays are never marked.
 */
class AttendanceAbsenceService
{
    /** Used when the employee has no shift, or the shift predates working_days. */
    public const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

    /** @var array<int, array<int>> shift_id => ISO weekdays */
    private array $shiftDays = [];

    /**
     * Mark absences for every day in [$from, $to] (inclusive). Today and the
     * future are skipped because the day is not over yet. Safe to re-run.
     *
     * @return int number of attendance rows created or updated
     */
    public function markAbsences(CarbonInterface $from, CarbonInterface $to, ?string $companyId = null): int
    {
        $from = Carbon::parse($from)->startOfDay();
        $to   = Carbon::parse($to)->startOfDay();
        $yesterday = Carbon::yesterday();
        if ($to->gt($yesterday)) {
            $to = $yesterday;
        }

        $marked = 0;
        for ($day = $from->copy(); $day->lte($to); $day->addDay()) {
            $marked += $this->markDay($day, $companyId);
        }

        return $marked;
    }

    public function markDay(CarbonInterface $day, ?string $companyId = null): int
    {
        $date = $day->toDateString();

        $employees = Employee::query()
            ->where('status', 'active')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->where(fn ($q) => $q->whereNull('joining_date')->orWhereDate('joining_date', '<=', $date))
            ->get(['id', 'company_id', 'shift_id']);

        if ($employees->isEmpty()) {
            return 0;
        }

        $holidayCompanies = Holiday::withoutGlobalScopes()
            ->whereDate('holiday_date', $date)
            ->where('is_optional', false)
            ->pluck('company_id')
            ->all();

        $onLeave = Leave::query()
            ->where('status', 'approved')
            ->whereDate('from_date', '<=', $date)
            ->whereDate('to_date', '>=', $date)
            ->whereIn('employee_id', $employees->pluck('id'))
            ->pluck('employee_id')
            ->flip();

        $existing = Attendance::query()
            ->whereDate('date', $date)
            ->whereIn('employee_id', $employees->pluck('id'))
            ->get()
            ->keyBy('employee_id');

        $marked = 0;
        foreach ($employees as $employee) {
            if (in_array($employee->company_id, $holidayCompanies, true)
                || !$this->isWorkingDay($employee, $day)
                || $onLeave->has($employee->id)) {
                continue;
            }

            $record = $existing->get($employee->id);
            if ($record) {
                // Any punch at all means they showed up; never overwrite real data.
                if ($record->check_in || $record->check_out || in_array($record->status, ['absent', 'leave'], true)) {
                    continue;
                }
                $record->update(['status' => 'absent']);
            } else {
                Attendance::create([
                    'employee_id' => $employee->id,
                    'date'        => $date,
                    'status'      => 'absent',
                    'notes'       => 'Auto-marked absent: no check-in/check-out and no approved leave.',
                ]);
            }
            $marked++;
        }

        return $marked;
    }

    public function isWorkingDay(Employee $employee, CarbonInterface $day): bool
    {
        return in_array($day->dayOfWeekIso, $this->workingDaysFor($employee), true);
    }

    /** @return array<int> ISO weekday numbers (1 = Monday ... 7 = Sunday) */
    public function workingDaysFor(Employee $employee): array
    {
        if (!$employee->shift_id) {
            return self::DEFAULT_WORKING_DAYS;
        }

        return $this->shiftDays[$employee->shift_id] ??= (function () use ($employee) {
            $days = Shift::withoutGlobalScopes()->whereKey($employee->shift_id)->value('working_days');
            $days = is_string($days) ? json_decode($days, true) : $days;

            return is_array($days) && $days !== []
                ? array_map('intval', $days)
                : self::DEFAULT_WORKING_DAYS;
        })();
    }
}
