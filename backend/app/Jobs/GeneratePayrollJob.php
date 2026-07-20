<?php

namespace App\Jobs;

use App\Models\Attendance;
use App\Models\BackgroundRun;
use App\Models\Bonus;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\Payroll;
use App\Services\PayrollCalculator;
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
            $employees = Employee::with(['shift'])->whereIn('id', $this->employeeIds)->get();

            $existingEmployeeIds = Payroll::where('month', $this->month)
                ->where('year', $this->year)
                ->pluck('employee_id')
                ->flip();

            $allBonuses = Bonus::whereIn('employee_id', $this->employeeIds)
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
                ->whereNotNull('check_out')
                ->get()
                ->groupBy('employee_id');

            $created = 0;
            $skipped = 0;
            $failed = 0;

            DB::transaction(function () use (
                $employees, $existingEmployeeIds, $allBonuses, $allDeductions, $allAttendances,
                $calculator, &$created, &$skipped, &$failed
            ) {
                foreach ($employees as $employee) {
                    if (isset($existingEmployeeIds[$employee->id])) {
                        $skipped++;
                        continue;
                    }

                    try {
                        $components = $calculator->calculateForEmployee(
                            $employee, $this->month, $this->year,
                            $allBonuses->get($employee->id, collect()),
                            $allDeductions->get($employee->id, collect()),
                            $allAttendances->get($employee->id, collect()),
                        );

                        Payroll::create([
                            'employee_id' => $employee->id,
                            'month' => $this->month,
                            'year' => $this->year,
                            'base_salary' => $components['base_salary'],
                            'bonus' => $components['bonuses'],
                            'deductions' => $components['deductions'],
                            'tax' => $components['tax'],
                            'net_salary' => $components['net_salary'],
                            'status' => Payroll::STATUS_DRAFT,
                            'payment_date' => null,
                        ]);

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
        } catch (\Throwable $e) {
            $run->update([
                'status' => BackgroundRun::STATUS_FAILED,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
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
