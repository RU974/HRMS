<?php

namespace App\Services;

use App\Models\Bonus;
use App\Models\Deduction;
use App\Models\Attendance;
use App\Services\AttendanceCalculator;
use Carbon\Carbon;

class PayrollCalculator
{
    protected TaxCalculator $taxCalculator;

    public function __construct()
    {
        $this->taxCalculator = new TaxCalculator();
    }

    /**
     * Calculate payroll components for an employee for a given month/year.
     * Returns associative array: base_salary, allowances, bonuses_total, overtime_pay,
     * deductions_total, tax, net_salary
     */
    public function calculateForEmployee(
        $employee,
        int $month,
        int $year,
        ?\Illuminate\Support\Collection $preloadedBonuses = null,
        ?\Illuminate\Support\Collection $preloadedDeductions = null,
        ?\Illuminate\Support\Collection $preloadedAttendances = null
    ): array {
        $baseSalary = (float) ($employee->basic_salary ?? $employee->salary ?? 0);
        $allowances = (float) ($employee->allowances ?? 0);

        $bonuses = $preloadedBonuses ?? Bonus::where('employee_id', $employee->id)
            ->whereYear('effective_date', $year)
            ->whereMonth('effective_date', $month)
            ->get();

        $bonusesTotal = (float) $bonuses->sum('amount');
        $taxableBonuses = (float) $bonuses->where('taxable', true)->sum('amount');

        $deductions = $preloadedDeductions ?? Deduction::where('employee_id', $employee->id)
            ->whereYear('effective_date', $year)
            ->whereMonth('effective_date', $month)
            ->get();

        $deductionsTotal = (float) $deductions->sum('amount');
        $loanDeductions = (float) $deductions->where('type', 'loan')->sum('amount');

        $attendances = $preloadedAttendances ?? Attendance::where('employee_id', $employee->id)
            ->whereYear('date', $year)
            ->whereMonth('date', $month)
            ->whereNotNull('check_out')
            ->get();

        $overtimeHours = 0.0;
        $shift = $employee->shift; // may be null
        $shiftDailyHours = 8.0;
        if ($shift && $shift->start_time && $shift->end_time) {
            try {
                $start = Carbon::parse($shift->start_time);
                $end = Carbon::parse($shift->end_time);
                $shiftDailyHours = max(1, $end->diffInMinutes($start) / 60.0);
            } catch (\Exception $e) {
                $shiftDailyHours = 8.0;
            }
        }

        $calculator = new AttendanceCalculator();
        foreach ($attendances as $att) {
            $overtimeHours += $calculator->calculateOvertimeHours($att, $shift);
        }

        $workingDays = config('payroll.working_days_per_month', 22);
        $hourlyRate = $shiftDailyHours > 0 ? ($baseSalary / ($workingDays * $shiftDailyHours)) : 0;
        $overtimeMultiplier = config('payroll.overtime_multiplier', 1.5);
        $overtimePay = round($overtimeHours * $hourlyRate * $overtimeMultiplier, 2);

        $gross = $baseSalary + $allowances + $bonusesTotal + $overtimePay;

        // taxable components: base, taxable bonuses, overtime
        $taxableAmount = $baseSalary + $taxableBonuses + $overtimePay;
        $tax = $this->taxCalculator->calculate($taxableAmount);

        $net = round(max(0, $gross - $deductionsTotal - $tax), 2);

        return [
            'base_salary' => round($baseSalary, 2),
            'allowances' => round($allowances, 2),
            'bonuses' => round($bonusesTotal, 2),
            'overtime_hours' => round($overtimeHours, 2),
            'overtime_pay' => $overtimePay,
            'deductions' => round($deductionsTotal, 2),
            'loan_deductions' => round($loanDeductions, 2),
            'tax' => $tax,
            'gross' => round($gross, 2),
            'net_salary' => $net,
        ];
    }
}
