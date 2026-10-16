<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Attendance rows written because of an approved leave point back at it, so a
        // cancelled / edited / deleted leave can take exactly its own rows away again.
        if (! Schema::hasColumn('attendances', 'leave_id')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->foreignId('leave_id')->nullable()->after('employee_id')
                    ->constrained('leaves')->nullOnDelete();
            });
        }

        // A half-day leave is 0.5 of a day, so balances can no longer be whole numbers.
        Schema::table('leave_balances', function (Blueprint $table) {
            $table->decimal('used_days', 6, 1)->default(0)->change();
            $table->decimal('pending_days', 6, 1)->default(0)->change();
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive: narrowing the balances back to integers would
        // round away recorded half days.
    }
};
