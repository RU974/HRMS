<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the `allowances` column to the payrolls table.
 *
 * PayrollCalculator::calculateForEmployee() reads employee->allowances and
 * returns it in the result array, but the payrolls table had no column to
 * store it and Payroll::$fillable did not include it — so allowances were
 * silently dropped on every generated payroll record.
 *
 * After running this migration also add 'allowances' to Payroll::$fillable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (! Schema::hasColumn('payrolls', 'allowances')) {
                // Place it right after base_salary to keep the column order logical
                $table->decimal('allowances', 12, 2)->default(0)->after('base_salary');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (Schema::hasColumn('payrolls', 'allowances')) {
                $table->dropColumn('allowances');
            }
        });
    }
};