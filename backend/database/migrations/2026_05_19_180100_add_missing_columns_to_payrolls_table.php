<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'year')) {
                $table->unsignedSmallInteger('year')->nullable()->after('month');
            }
            if (!Schema::hasColumn('payrolls', 'base_salary')) {
                $table->decimal('base_salary', 12, 2)->default(0)->after('year');
            }
            if (!Schema::hasColumn('payrolls', 'bonus')) {
                $table->decimal('bonus', 12, 2)->default(0)->after('base_salary');
            }
            if (!Schema::hasColumn('payrolls', 'tax')) {
                $table->decimal('tax', 12, 2)->default(0)->after('deductions');
            }
            if (!Schema::hasColumn('payrolls', 'payment_date')) {
                $table->date('payment_date')->nullable()->after('net_salary');
            }
            if (!Schema::hasColumn('payrolls', 'status')) {
                $table->string('status')->default('pending')->after('payment_date');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            foreach (['year', 'base_salary', 'bonus', 'tax', 'payment_date', 'status'] as $column) {
                if (Schema::hasColumn('payrolls', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
