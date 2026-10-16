<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\LeaveType;
use App\Models\PayrollAttendancePolicy;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Turns a month of attendance and leave into days of unpaid time.
 *
 * Every scheduled working day of the month (shift working days, minus company holidays)
 * is looked at once:
 *  - before the joining date            -> unpaid
 *  - approved leave of an unpaid type   -> unpaid (0.5 for a half-day leave)
 *  - approved leave of a paid type      -> paid
 *  - no punches and marked absent, or no attendance row at all (the absence job simply
 *    has not run) -> absent
 *  - half day without a leave covering it -> half-day deduction
 *  - late arrivals are counted; every N of them cost a configured number of days
 * Days that are not over yet (today and later) are never judged. Someone who punched in on
 * a day they also had leave is treated as having worked.
 */
class PayrollAttendanceService
{
    private AttendanceAbsenceService $days;

    /** @var array<string, array<string, true>> "company|Y-m" => holiday dates */
    private array $holidayCache = [];

    /** @var array<string, bool> "company|Y-m" => the company has any attendance rows that month */
    private array $trackingCache = [];

    /** @var array<string, bool> "company|lowercase type" => is paid */
    private array $paidCache = [];

    public function __construct(?AttendanceAbsenceService $days = null)
    {
        $this->days = $days ?? new AttendanceAbsenceService();
    }

    /**
     * @param  Collection<int, Attendance>|null  $attendances  this employee's rows for the month (all of them, not only closed ones)
     * @param  Collection<int, Leave>|null       $leaves       this employee's approved leaves that touch the month
     * @return array<string, mixed>
     */
    public function summarize(Employee $employee, int $month, int $year, ?Collection $attendances = null, ?Collection $leaves = null): array
    {
        $companyId = $employee->company_id ? (string) $employee->company_id : null;
        $policy = PayrollAttendancePolicy::settingsFor($companyId);

        $monthStart = Carbon::create($year, $month, 1)->startOfDay();
        $monthEnd = $monthStart->copy()->endOfMonth()->startOfDay();
        $lastJudged = Carbon::yesterday()->min($monthEnd);

        $attendances ??= Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereYear('date', $year)
            ->whereMonth('date', $month)
            ->get();
        $rows = $attendances->keyBy(fn ($a) => Carbon::parse($a->date)->toDateString());

        $leaves ??= Leave::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->whereDate('from_date', '<=', $monthEnd->toDateString())
            ->whereDate('to_date', '>=', $monthStart->toDateString())
            ->get();

        $holidays = $this->holidays($companyId, $monthStart);
        // A company (or person) with no attendance rows at all in the month does not use
        // attendance tracking, so a missing row there is not evidence of an absence.
        $tracked = $rows->isNotEmpty() || $this->companyTracksAttendance($companyId, $monthStart);
        $joining = $employee->joining_date ? Carbon::parse($employee->joining_date)->startOfDay() : null;

        $scheduled = 0;
        $preJoining = 0;
        $absent = 0;
        $halfDays = 0;
        $lates = 0;
        $paidLeave = 0.0;
        $unpaidLeave = 0.0;
        $missingPunch = 0;

        for ($day = $monthStart->copy(); $day->lte($monthEnd); $day->addDay()) {
            $date = $day->toDateString();
            if (!$this->days->isWorkingDay($employee, $day) || isset($holidays[$date])) {
                continue;
            }
            $scheduled++;

            if ($joining && $day->lt($joining)) {
                $preJoining++;
                continue;
            }
            if ($day->gt($lastJudged)) {
                continue;
            }

            $row = $rows->get($date);
            $hasPunch = $row && ($row->check_in || $row->check_out);
            $leave = $this->leaveOn($leaves, $day);

            if ($leave && !$leave->half_day && !$hasPunch) {
                if ($this->isPaidLeave($leave, $employee)) {
                    $paidLeave++;
                } else {
                    $unpaidLeave++;
                }
                continue;
            }
            if ($leave && $leave->half_day) {
                if ($this->isPaidLeave($leave, $employee)) {
                    $paidLeave += 0.5;
                } else {
                    $unpaidLeave += 0.5;
                }
                if ($hasPunch && $row->status === 'late') {
                    $lates++;
                }
                continue;
            }

            if ($hasPunch) {
                if ($row->status === Attendance::STATUS_HALF_DAY) {
                    $halfDays++;
                } elseif ($row->status === 'late') {
                    $lates++;
                } elseif (in_array($row->status, Attendance::MISSING_STATUSES, true)) {
                    $missingPunch++;
                }
                continue;
            }

            $status = $row?->status;
            if ($status === 'leave') {
                $paidLeave++; // set by hand with no leave request behind it: nothing says it is unpaid
            } elseif ($status === Attendance::STATUS_HALF_DAY) {
                $halfDays++;
            } elseif ($status === 'absent' || ($status === null && $tracked)) {
                $absent++;
            }
            // present / late / missing punch with no times were set by hand: paid as recorded
        }

        $lateBlocks = $policy['lates_per_deduction'] > 0 ? intdiv($lates, $policy['lates_per_deduction']) : 0;

        $deductionDays = $policy['enabled']
            ? $absent * $policy['absent_deduction_days']
                + $halfDays * $policy['half_day_deduction_days']
                + $unpaidLeave
                + $lateBlocks * $policy['late_deduction_days']
                + $preJoining
            : 0.0;
        $deductionDays = $scheduled > 0 ? round(min($deductionDays, (float) $scheduled), 2) : 0.0;

        return [
            'enabled' => $policy['enabled'],
            'attendance_tracked' => $tracked,
            'scheduled_days' => $scheduled,
            'absent_days' => $absent,
            'half_days' => $halfDays,
            'late_count' => $lates,
            'late_blocks' => $lateBlocks,
            'paid_leave_days' => $paidLeave,
            'unpaid_leave_days' => $unpaidLeave,
            'pre_joining_days' => $preJoining,
            'missing_punch_days' => $missingPunch,
            'unpaid_days' => $deductionDays,
            'policy' => $policy,
        ];
    }

    /** The pay to withhold for those days: the daily rate is base salary over the month's scheduled days. */
    public function amount(float $baseSalary, array $summary): float
    {
        if (($summary['scheduled_days'] ?? 0) <= 0 || ($summary['unpaid_days'] ?? 0) <= 0) {
            return 0.0;
        }

        return round(min($baseSalary, $baseSalary / $summary['scheduled_days'] * $summary['unpaid_days']), 2);
    }

    private function leaveOn(Collection $leaves, Carbon $day): ?Leave
    {
        return $leaves->first(function (Leave $leave) use ($day) {
            $from = Carbon::parse($leave->from_date)->startOfDay();
            $to = $leave->half_day ? $from->copy() : Carbon::parse($leave->to_date)->startOfDay();

            return $day->betweenIncluded($from, $to);
        });
    }

    private function isPaidLeave(Leave $leave, Employee $employee): bool
    {
        $name = mb_strtolower(trim((string) $leave->type));
        $key = ($employee->company_id ?? '') . '|' . $name;

        return $this->paidCache[$key] ??= (function () use ($employee, $name) {
            $type = LeaveType::withoutGlobalScopes()
                ->where('company_id', $employee->company_id)
                ->whereRaw('LOWER(name) = ?', [$name])
                ->first();

            if ($type) {
                return (bool) $type->is_paid;
            }

            // A leave whose type was removed: only a name that says so is unpaid.
            return !preg_match('/unpaid|without pay|\blwp\b/i', $name);
        })();
    }

    private function companyTracksAttendance(?string $companyId, Carbon $monthStart): bool
    {
        if (!$companyId) {
            return false;
        }

        return $this->trackingCache[$companyId . '|' . $monthStart->format('Y-m')] ??= Attendance::query()
            ->whereBetween('date', [$monthStart->toDateString(), $monthStart->copy()->endOfMonth()->toDateString()])
            ->whereIn('employee_id', Employee::withoutGlobalScopes()->where('company_id', $companyId)->select('id'))
            ->exists();
    }

    /** @return array<string, true> */
    private function holidays(?string $companyId, Carbon $monthStart): array
    {
        $key = $companyId . '|' . $monthStart->format('Y-m');

        return $this->holidayCache[$key] ??= Holiday::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where('is_optional', false)
            ->whereBetween('holiday_date', [$monthStart->toDateString(), $monthStart->copy()->endOfMonth()->toDateString()])
            ->pluck('holiday_date')
            ->mapWithKeys(fn ($d) => [Carbon::parse($d)->toDateString() => true])
            ->all();
    }
}
