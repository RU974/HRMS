<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SalaryGrade::employees() has always declared a hasMany() against
 * employees.salary_grade_id, but that column never existed, so the salary
 * grades feature had no way to actually be assigned to anyone. This adds
 * the missing column. It is informational only — PayrollCalculator keeps
 * using Employee.basic_salary directly, so assigning a grade does not
 * silently change anyone's computed pay.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'salary_grade_id')) {
                $table->foreignId('salary_grade_id')->nullable()->after('basic_salary')->constrained('salary_grades')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'salary_grade_id')) {
                $table->dropConstrainedForeignId('salary_grade_id');
            }
        });
    }
};
