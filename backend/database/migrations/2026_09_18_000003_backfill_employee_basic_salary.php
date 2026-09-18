<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The employees.basic_salary column was added after employees.salary already
 * existed, defaulted to 0, and was never backfilled. PayrollCalculator's
 * "$employee->basic_salary ?? $employee->salary" fallback never actually
 * triggers for these rows because 0 is not null, so any employee created
 * before that column existed (and never re-saved since) gets payroll
 * calculated off a 0 base salary. Backfill basic_salary from the legacy
 * salary/allowances split for any row still sitting at the column default.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('employees')
            ->where(function ($q) {
                $q->whereNull('basic_salary')->orWhere('basic_salary', 0);
            })
            ->where('salary', '>', 0)
            ->get(['id', 'salary', 'allowances']);

        foreach ($rows as $row) {
            $allowances = (float) ($row->allowances ?? 0);
            $basic = (float) $row->salary - $allowances;
            if ($basic <= 0) {
                $basic = (float) $row->salary;
            }

            DB::table('employees')->where('id', $row->id)->update(['basic_salary' => $basic]);
        }
    }

    public function down(): void
    {
        // Not reversible: original 0/null state is not recoverable and
        // reverting would reintroduce the bug this migration fixes.
    }
};
