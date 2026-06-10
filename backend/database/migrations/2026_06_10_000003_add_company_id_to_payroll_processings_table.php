<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add company_id to payroll_processings for multi-tenant isolation.
 *
 * Every other shared resource table (announcements, notifications, chat_messages,
 * audit_logs, etc.) has a company_id column so data is scoped per tenant.
 * payroll_processings was the only table that was missed — without this column,
 * Company A can see and overwrite Company B's payroll run records.
 *
 * After running this migration the PayrollProcessing model and
 * PayrollProcessingController are updated to scope all queries by company_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_processings', function (Blueprint $table): void {
            if (! Schema::hasColumn('payroll_processings', 'company_id')) {
                $table->uuid('company_id')->nullable()->after('id')->index();
                $table->foreign('company_id')
                      ->references('id')
                      ->on('companies')
                      ->nullOnDelete();
            }

            // The original unique constraint only covered (month, year).
            // That means two companies could never run payroll for the same month/year,
            // which would break in a multi-tenant setup.
            // Replace it with a per-company unique constraint.
            //
            // We do this inside a try/catch because the original constraint name
            // may vary across environments (SQLite vs MySQL).
            try {
                $table->dropUnique(['month', 'year']);
            } catch (\Throwable) {
                // Already dropped or different name — safe to ignore
            }

            $table->unique(['company_id', 'month', 'year'], 'payroll_processings_company_month_year_unique');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_processings', function (Blueprint $table): void {
            try {
                $table->dropUnique('payroll_processings_company_month_year_unique');
            } catch (\Throwable) {}

            if (Schema::hasColumn('payroll_processings', 'company_id')) {
                $table->dropForeign(['company_id']);
                $table->dropColumn('company_id');
            }

            // Restore the original (broken) unique constraint on rollback
            $table->unique(['month', 'year']);
        });
    }
};