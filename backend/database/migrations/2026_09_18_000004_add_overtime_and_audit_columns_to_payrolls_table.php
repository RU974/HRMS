<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PayrollCalculator has always computed overtime_pay and folded it into
 * net_salary, but never persisted it — so net_salary didn't reconcile with
 * the visible base/allowances/bonus/deductions/tax columns whenever an
 * employee worked overtime, and payslips couldn't show the line item.
 *
 * Also adds approval/payment audit columns (who/when) so lifecycle
 * transitions are traceable, and rejection fields for the new reject flow.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'overtime_hours')) {
                $table->decimal('overtime_hours', 8, 2)->default(0)->after('bonus');
            }
            if (!Schema::hasColumn('payrolls', 'overtime_pay')) {
                $table->decimal('overtime_pay', 12, 2)->default(0)->after('overtime_hours');
            }
            if (!Schema::hasColumn('payrolls', 'approved_by')) {
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('payrolls', 'approved_at')) {
                $table->timestamp('approved_at')->nullable();
            }
            if (!Schema::hasColumn('payrolls', 'paid_by')) {
                $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('payrolls', 'paid_at')) {
                $table->timestamp('paid_at')->nullable();
            }
            if (!Schema::hasColumn('payrolls', 'rejected_at')) {
                $table->timestamp('rejected_at')->nullable();
            }
            if (!Schema::hasColumn('payrolls', 'rejection_reason')) {
                $table->text('rejection_reason')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            foreach (['approved_by', 'paid_by'] as $fk) {
                if (Schema::hasColumn('payrolls', $fk)) {
                    $table->dropConstrainedForeignId($fk);
                }
            }
            foreach (['overtime_hours', 'overtime_pay', 'approved_at', 'paid_at', 'rejected_at', 'rejection_reason'] as $col) {
                if (Schema::hasColumn('payrolls', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
