<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('commissions')) {
            Schema::create('commissions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
                $table->foreignId('payroll_id')->nullable()->constrained('payrolls')->nullOnDelete();
                $table->decimal('business_amount', 14, 2);
                // Snapshot of the employee's rate at the time of entry, so later
                // rate changes never rewrite past commissions.
                $table->decimal('commission_percentage', 5, 2);
                $table->decimal('commission_amount', 14, 2);
                $table->date('effective_date');
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->index(['employee_id', 'effective_date']);
            });
        }

        Schema::table('payrolls', function (Blueprint $table) {
            if (!Schema::hasColumn('payrolls', 'commission')) {
                $table->decimal('commission', 12, 2)->default(0)->after('bonus');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            if (Schema::hasColumn('payrolls', 'commission')) {
                $table->dropColumn('commission');
            }
        });
        Schema::dropIfExists('commissions');
    }
};
