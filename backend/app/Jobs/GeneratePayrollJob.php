<?php

namespace App\Jobs;

use App\Models\Attendance;
use App\Models\BackgroundRun;
use App\Models\Bonus;
use App\Models\Commission;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\LoanAdvance;
use App\Models\Payroll;
use App\Models\PayrollProcessing;
use App\Services\PayrollCalculator;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class GeneratePayrollJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;

    public int $tries = 1;

    /**
     * @param int[] $employeeIds
     */
    public function __construct(
        private readonly int $backgroundRunId,
        private readonly array $employeeIds,
        private readonly int $month,
        private readonly int $year,
        private readonly ?int $payrollProcessingId = null,
    ) {
    }

    public function handle(PayrollCalculator $calculator): void
    {
        $run = BackgroundRun::find($this->backgroundRunId);
        if (!$run) {
            return;
        }

        $run->update(['status' => BackgroundRun::STATUS_PROCESSING]);

        try {
            $created = 0;
            $skipped = 0;
            $failed = 0;

            DB::transaction(function () use ($calculator, &$created, &$skipped, &$failed) {
                $this->ensureLoanEmiDeductions($this->employeeIds, $this->month, $this->year);
                $this->ensureSalaryDeductionAdvances($this->employeeIds, $this->month, $this->year);

                $employees = Employee::with(['shift'])->whereIn('id', $this->employeeIds)->get();

                $existingEmployeeIds = Payroll::where('month', $this->month)
                    ->where('year', $this->year)
                    ->whereIn('employee_id', $this->employeeIds)
                    ->pluck('employee_id')
                    ->flip();

                $allBonuses = Bonus::whereIn('employee_id', $this->employeeIds)
                    ->whereYear('effective_date', $this->year)
                    ->whereMonth('effective_date', $this->month)
                    ->get()
                    ->groupBy('employee_id');

                $allCommissions = Commission::whereIn('employee_id', $this->employeeIds)
                    ->whereYear('effective_date', $this->year)
                    ->whereMonth('effective_date', $this->month)
                    ->get()
                    ->groupBy('employee_id');

                $allDeductions = Deduction::whereIn('employee_id', $this->employeeIds)
                    ->whereYear('effective_date', $this->year)
                    ->whereMonth('effective_date', $this->month)
                    ->get()
                    ->groupBy('employee_id');

                $allAttendances = Attendance::whereIn('employee_id', $this->employeeIds)
                    ->whereYear('date', $this->year)
                    ->whereMonth('date', $this->month)
                    ->get()
                    ->groupBy('employee_id');

                $monthStart = Carbon::create($this->year, $this->month, 1)->startOfMonth();
                $allLeaves = Leave::whereIn('employee_id', $this->employeeIds)
                    ->where('status', 'approved')
                    ->whereDate('from_date', '<=', $monthStart->copy()->endOfMonth()->toDateString())
                    ->whereDate('to_date', '>=', $monthStart->toDateString())
                    ->get()
                    ->groupBy('employee_id');

                foreach ($employees as $employee) {
                    if (isset($existingEmployeeIds[$employee->id])) {
                        $skipped++;
                        continue;
                    }

                    try {
                        $employeeBonuses = $allBonuses->get($employee->id, collect());
                        $employeeDeductions = $allDeductions->get($employee->id, collect());
                        $employeeCommissions = $allCommissions->get($employee->id, collect());

                        $components = $calculator->calculateForEmployee(
                            $employee, $this->month, $this->year,
                            $employeeBonuses,
                            $employeeDeductions,
                            $allAttendances->get($employee->id, collect()),
                            $employeeCommissions,
                            $allLeaves->get($employee->id, collect()),
                        );

                        $payroll = Payroll::create([
                            'employee_id' => $employee->id,
                            'month' => $this->month,
                            'year' => $this->year,
                            'base_salary' => $components['base_salary'],
                            'allowances' => $components['allowances'],
                            'bonus' => $components['bonuses'],
                            'commission' => $components['commission'],
                            'overtime_hours' => $components['overtime_hours'],
                            'overtime_pay' => $components['overtime_pay'],
                            'deductions' => $components['deductions'],
                            'attendance_deduction' => $components['attendance_deduction'],
                            'unpaid_days' => $components['unpaid_days'],
                            'attendance_summary' => $components['attendance_summary'],
                            'tax' => $components['tax'],
                            'net_salary' => $components['net_salary'],
                            'status' => Payroll::STATUS_DRAFT,
                            'payment_date' => null,
                        ]);

                        // Link the bonus/deduction rows that fed this payroll so it's
                        // traceable which records were factored in, and so the payroll
                        // can later be flagged stale if one of them changes.
                        Bonus::whereIn('id', $employeeBonuses->pluck('id'))->whereNull('payroll_id')->update(['payroll_id' => $payroll->id]);
                        Deduction::whereIn('id', $employeeDeductions->pluck('id'))->whereNull('payroll_id')->update(['payroll_id' => $payroll->id]);
                        Commission::whereIn('id', $employeeCommissions->pluck('id'))->whereNull('payroll_id')->update(['payroll_id' => $payroll->id]);

                        $created++;
                    } catch (\Throwable $e) {
                        Log::warning('Payroll generation failed for employee', [
                            'employee_id' => $employee->id,
                            'month' => $this->month,
                            'year' => $this->year,
                            'error' => $e->getMessage(),
                        ]);
                        $failed++;
                    }
                }
            });

            $run->update([
                'status' => BackgroundRun::STATUS_DONE,
                'summary' => compact('created', 'skipped', 'failed'),
            ]);

            $this->updateProcessingStatus('completed', "Generated {$created}, skipped {$skipped}, failed {$failed}.");
        } catch (\Throwable $e) {
            $run->update([
                'status' => BackgroundRun::STATUS_FAILED,
                'error' => $e->getMessage(),
            ]);
            $this->updateProcessingStatus('cancelled', 'Generation failed: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Auto-create this month's EMI deduction for every active loan/advance
     * held by the employees being processed, and pay it down against the
     * loan's outstanding balance. Previously LoanAdvance had no connection
     * to payroll generation at all — EMIs had to be entered manually and
     * outstanding_balance never moved unless someone remembered to edit it.
     *
     * @param int[] $employeeIds
     */
    private function ensureLoanEmiDeductions(array $employeeIds, int $month, int $year): void
    {
        $activeLoans = LoanAdvance::whereIn('employee_id', $employeeIds)
            ->where('status', 'active')
            ->where('emi_amount', '>', 0)
            ->get();

        if ($activeLoans->isEmpty()) {
            return;
        }

        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();

        foreach ($activeLoans as $loan) {
            $alreadyDeducted = Deduction::where('loan_advance_id', $loan->id)
                ->whereYear('effective_date', $year)
                ->whereMonth('effective_date', $month)
                ->exists();

            if ($alreadyDeducted) {
                continue;
            }

            $amount = round(min((float) $loan->emi_amount, (float) $loan->outstanding_balance), 2);
            if ($amount <= 0) {
                continue;
            }

            Deduction::create([
                'employee_id' => $loan->employee_id,
                'loan_advance_id' => $loan->id,
                'title' => 'Loan EMI - ' . $loan->title,
                'amount' => $amount,
                'type' => 'loan',
                'effective_date' => $periodStart->toDateString(),
                'notes' => 'Auto-generated EMI deduction for this payroll run.',
            ]);

            $loan->outstanding_balance = round(max(0, (float) $loan->outstanding_balance - $amount), 2);
            if ($loan->outstanding_balance <= 0) {
                $loan->status = 'completed';
            }
            $loan->save();
        }
    }

    /**
     * Create this month's deduction for every loan/advance flagged
     * "deduct_from_salary". The amount is the EMI when set, otherwise the whole
     * outstanding balance (capped at it). Unlike active-loan EMIs, the balance is
     * NOT reduced here: it is settled and the advance closed when the payroll is
     * marked paid (see LoanAdvance::settleForPayroll). Employees who already have
     * a payroll for the period are skipped so a re-run cannot double-deduct.
     *
     * @param int[] $employeeIds
     */
    private function ensureSalaryDeductionAdvances(array $employeeIds, int $month, int $year): void
    {
        $alreadyGenerated = Payroll::where('month', $month)->where('year', $year)
            ->whereIn('employee_id', $employeeIds)->pluck('employee_id')->all();

        $loans = LoanAdvance::whereIn('employee_id', array_diff($employeeIds, $alreadyGenerated))
            ->recoverableFromSalary()
            ->where('outstanding_balance', '>', 0)
            ->whereDate('start_date', '<=', Carbon::create($year, $month, 1)->endOfMonth()->toDateString())
            ->get();

        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();

        foreach ($loans as $loan) {
            $exists = Deduction::where('loan_advance_id', $loan->id)
                ->whereYear('effective_date', $year)
                ->whereMonth('effective_date', $month)
                ->exists();
            if ($exists) {
                continue;
            }

            $balance = (float) $loan->outstanding_balance;
            $emi = (float) $loan->emi_amount;
            $amount = round($emi > 0 ? min($emi, $balance) : $balance, 2);
            if ($amount <= 0) {
                continue;
            }

            Deduction::create([
                'employee_id' => $loan->employee_id,
                'loan_advance_id' => $loan->id,
                'title' => ucfirst($loan->type ?? 'loan') . ' recovery - ' . $loan->title,
                'amount' => $amount,
                'type' => 'loan',
                'effective_date' => $periodStart->toDateString(),
                'notes' => 'Auto-generated salary deduction; advance closes when payroll is paid.',
            ]);
        }
    }

    private function updateProcessingStatus(string $status, string $notes): void
    {
        if (!$this->payrollProcessingId) {
            return;
        }

        PayrollProcessing::where('id', $this->payrollProcessingId)->update([
            'status' => $status,
            'processed_at' => now(),
            'notes' => $notes,
        ]);
    }

    public function failed(?\Throwable $exception): void
    {
        BackgroundRun::where('id', $this->backgroundRunId)
            ->where('status', '!=', BackgroundRun::STATUS_DONE)
            ->update([
                'status' => BackgroundRun::STATUS_FAILED,
                'error' => $exception?->getMessage() ?? 'Payroll generation timed out or crashed unexpectedly.',
            ]);
    }
}
