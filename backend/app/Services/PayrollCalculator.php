<?php

namespace App\Services;

use App\Models\Bonus;
use App\Models\Commission;
use App\Models\Deduction;
use App\Models\Attendance;
use App\Services\AttendanceCalculator;
use Carbon\Carbon;

class PayrollCalculator
{
    protected TaxCalculator $taxCalculator;

    protected PayrollAttendanceService $attendanceService;

    public function __construct()
    {
        $this->taxCalculator = new TaxCalculator();
        $this->attendanceService = new PayrollAttendanceService();
    }

    /** Length of a shift in hours (overnight shifts roll over midnight), or null without a shift. */
    private function shiftHours(?\App\Models\Shift $shift): ?float
    {
        if (!$shift || !$shift->start_time || !$shift->end_time) {
            return null;
        }

        try {
            $start = Carbon::parse($shift->start_time);
            $end = Carbon::parse($shift->end_time);
            // Overnight shift (e.g. 22:00 -> 06:00): roll end forward a day so the diff reflects
            // the actual shift length instead of the ~16h gap between the raw times.
            if ($end->lessThanOrEqualTo($start)) {
                $end->addDay();
            }

            // Plain timestamp arithmetic: Carbon 3's diffInMinutes() sign differs from Carbon 2's.
            return max(1, ($end->getTimestamp() - $start->getTimestamp()) / 3600.0);
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Overtime hours and pay for a month's attendance. The only source of overtime in payroll:
     * automatic, capped per day, no approval, none on a weekly off or holiday. Nothing a client
     * sends can change it.
     *
     * @return array{hours: float, pay: float}
     */
    public function overtimeFor($employee, float $baseSalary, \Illuminate\Support\Collection $attendances): array
    {
        // Hours in a normal day: the average of the shifts the month's records were judged against
        // (rosters and rotations can mix shifts), else the employee's own shift, else 8.
        $durations = $attendances->map(fn ($att) => $this->shiftHours($att->judgingShift()))->filter()->values();
        $shiftDailyHours = $durations->isNotEmpty()
            ? (float) $durations->avg()
            : ($this->shiftHours($employee->shift) ?? 8.0);

        $calculator = new AttendanceCalculator();
        $companyId = $employee->company_id ? (string) $employee->company_id : null;
        $hours = 0.0;
        foreach ($attendances as $att) {
            if ($att->check_out) {
                $hours += $calculator->calculateOvertimeHours($att, $att->judgingShift(), $companyId);
            }
        }

        $workingDays = config('payroll.working_days_per_month', 22);
        $hourlyRate = $shiftDailyHours > 0 ? ($baseSalary / ($workingDays * $shiftDailyHours)) : 0;
        $pay = round($hours * $hourlyRate * config('payroll.overtime_multiplier', 1.5), 2);

        return ['hours' => round($hours, 2), 'pay' => $pay];
    }

    /**
     * Calculate payroll components for an employee for a given month/year.
     * Returns associative array: base_salary, allowances, bonuses_total, overtime_pay,
     * deductions_total, attendance_deduction, tax, net_salary.
     * $preloadedAttendances must hold every attendance row of the employee for the month
     * (open ones too): absences, half days and lates are read from them.
     */
    public function calculateForEmployee(
        $employee,
        int $month,
        int $year,
        ?\Illuminate\Support\Collection $preloadedBonuses = null,
        ?\Illuminate\Support\Collection $preloadedDeductions = null,
        ?\Illuminate\Support\Collection $preloadedAttendances = null,
        ?\Illuminate\Support\Collection $preloadedCommissions = null,
        ?\Illuminate\Support\Collection $preloadedLeaves = null
    ): array {
        // basic_salary defaults to 0 (not null) for employees created before that
        // column existed, so "?? $employee->salary" never actually falls back —
        // 0 is not null. Use "?:" so a zero/unset basic_salary falls back too.
        $baseSalary = (float) ($employee->basic_salary ?: $employee->salary ?: 0);
        $allowances = (float) ($employee->allowances ?? 0);

        $bonuses = $preloadedBonuses ?? Bonus::where('employee_id', $employee->id)
            ->whereYear('effective_date', $year)
            ->whereMonth('effective_date', $month)
            ->get();

        $bonusesTotal = (float) $bonuses->sum('amount');
        $taxableBonuses = (float) $bonuses->where('taxable', true)->sum('amount');

        $commissions = $preloadedCommissions ?? Commission::where('employee_id', $employee->id)
            ->whereYear('effective_date', $year)
            ->whereMonth('effective_date', $month)
            ->get();

        $commissionTotal = (float) $commissions->sum('commission_amount');

        $deductions = $preloadedDeductions ?? Deduction::where('employee_id', $employee->id)
            ->whereYear('effective_date', $year)
            ->whereMonth('effective_date', $month)
            ->get();

        $deductionsTotal = (float) $deductions->sum('amount');
        $loanDeductions = (float) $deductions->where('type', 'loan')->sum('amount');

        $attendances = $preloadedAttendances ?? Attendance::where('employee_id', $employee->id)
            ->whereYear('date', $year)
            ->whereMonth('date', $month)
            ->get();

        ['hours' => $overtimeHours, 'pay' => $overtimePay] = $this->overtimeFor($employee, $baseSalary, $attendances);

        // Absences, unpaid leave, half days, lates and days before joining cost pay.
        $attendanceSummary = $this->attendanceService->summarize($employee, $month, $year, $attendances, $preloadedLeaves);
        $attendanceDeduction = $this->attendanceService->amount($baseSalary, $attendanceSummary);

        $gross = $baseSalary + $allowances + $bonusesTotal + $commissionTotal + $overtimePay;

        // taxable components: base earned (after attendance deduction), taxable bonuses, commission, overtime
        $taxableAmount = max(0, $baseSalary - $attendanceDeduction) + $taxableBonuses + $commissionTotal + $overtimePay;
        $tax = $this->taxCalculator->calculate($taxableAmount, $employee->company_id ?? null);

        $net = round(max(0, $gross - $deductionsTotal - $attendanceDeduction - $tax), 2);

        return [
            'base_salary' => round($baseSalary, 2),
            'allowances' => round($allowances, 2),
            'bonuses' => round($bonusesTotal, 2),
            'commission' => round($commissionTotal, 2),
            'overtime_hours' => round($overtimeHours, 2),
            'overtime_pay' => $overtimePay,
            'deductions' => round($deductionsTotal, 2),
            'loan_deductions' => round($loanDeductions, 2),
            'attendance_deduction' => $attendanceDeduction,
            'unpaid_days' => (float) $attendanceSummary['unpaid_days'],
            'attendance_summary' => $attendanceSummary,
            'tax' => $tax,
            'gross' => round($gross, 2),
            'net_salary' => $net,
        ];
    }
}
