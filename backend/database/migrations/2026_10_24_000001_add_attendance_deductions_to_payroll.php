<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            // Pay lost to absences, unpaid leave, half days, lates and days before joining.
            $table->decimal('attendance_deduction', 12, 2)->default(0)->after('deductions');
            // Days of base salary that were not paid (absent + unpaid leave + half days + late penalty + pre-joining).
            $table->decimal('unpaid_days', 6, 2)->default(0)->after('attendance_deduction');
            // Full breakdown the number came from, so a payslip can explain itself.
            $table->json('attendance_summary')->nullable()->after('unpaid_days');
        });

        Schema::create('payroll_attendance_policies', function (Blueprint $table) {
            $table->id();
            $table->char('company_id', 36)->unique();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->boolean('enabled')->default(true);
            $table->decimal('absent_deduction_days', 4, 2)->default(1);
            $table->decimal('half_day_deduction_days', 4, 2)->default(0.5);
            // Every N late arrivals in the month cost late_deduction_days (0 turns it off).
            $table->unsignedSmallInteger('lates_per_deduction')->default(3);
            $table->decimal('late_deduction_days', 4, 2)->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_attendance_policies');

        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn(['attendance_deduction', 'unpaid_days', 'attendance_summary']);
        });
    }
};
