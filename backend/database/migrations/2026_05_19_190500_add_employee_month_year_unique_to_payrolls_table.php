<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'employee_id') || !Schema::hasColumn('payrolls', 'month') || !Schema::hasColumn('payrolls', 'year')) {
                return;
            }

            $table->unique(['employee_id', 'month', 'year'], 'payrolls_employee_month_year_unique');
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropUnique('payrolls_employee_month_year_unique');
        });
    }
};
