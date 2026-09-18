<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * LoanAdvance had no link to the deductions it should generate each payroll
 * run — EMI collection was entirely manual and outstanding_balance never
 * moved on its own. This column lets GeneratePayrollJob auto-create (and
 * later recognise) the EMI deduction for a given loan/month without
 * fragile text matching.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deductions', function (Blueprint $table) {
            if (!Schema::hasColumn('deductions', 'loan_advance_id')) {
                $table->foreignId('loan_advance_id')->nullable()->after('payroll_id')->constrained('loan_advances')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('deductions', function (Blueprint $table) {
            if (Schema::hasColumn('deductions', 'loan_advance_id')) {
                $table->dropConstrainedForeignId('loan_advance_id');
            }
        });
    }
};
