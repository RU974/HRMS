<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Splits loan_advances into two kinds so the payroll UI can show separate
 * "Loans" and "Advances" tabs. Existing rows are treated as loans.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loan_advances', function (Blueprint $table) {
            if (!Schema::hasColumn('loan_advances', 'type')) {
                $table->string('type', 20)->default('loan')->after('company_id')->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('loan_advances', function (Blueprint $table) {
            if (Schema::hasColumn('loan_advances', 'type')) {
                $table->dropColumn('type');
            }
        });
    }
};
