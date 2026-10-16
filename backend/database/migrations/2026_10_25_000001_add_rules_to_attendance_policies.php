<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Every rule defaults to "off" (or, for auto_mark_absent, to what the system already did),
    // so existing companies behave exactly as before until they turn something on.
    public function up(): void
    {
        Schema::table('attendance_policies', function (Blueprint $table) {
            // Early leave: leaving before the shift end (or a fixed time when there is no shift).
            $table->boolean('early_leave_enabled')->default(false);
            $table->unsignedSmallInteger('early_leave_grace_minutes')->default(0);
            $table->time('early_leave_before_time')->nullable();
            $table->boolean('early_leave_counts_as_late')->default(false);

            // Minimum hours: a closed day shorter than this is a half day, or absent below the half-day mark.
            $table->decimal('full_day_hours', 4, 2)->nullable();
            $table->decimal('half_day_hours', 4, 2)->nullable();
            $table->boolean('count_short_as_absent')->default(false);

            // Arriving this many minutes after the late cut-off becomes a half day / an absence.
            $table->unsignedSmallInteger('half_day_after_late_minutes')->nullable();
            $table->unsignedSmallInteger('absent_after_late_minutes')->nullable();

            // N lates = 1 absent (0 = off).
            $table->unsignedSmallInteger('lates_per_absent')->default(0);

            // When someone counts as absent.
            $table->boolean('auto_mark_absent')->default(true);
            $table->boolean('missing_punch_as_absent')->default(false);
        });

        Schema::table('attendances', function (Blueprint $table) {
            // 'policy' = the half_day / absent status was worked out from the punches by the policy
            // (so it is re-evaluated when the punches change); NULL = chosen by hand.
            $table->string('status_reason', 20)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn('status_reason');
        });

        Schema::table('attendance_policies', function (Blueprint $table) {
            $table->dropColumn([
                'early_leave_enabled', 'early_leave_grace_minutes', 'early_leave_before_time', 'early_leave_counts_as_late',
                'full_day_hours', 'half_day_hours', 'count_short_as_absent',
                'half_day_after_late_minutes', 'absent_after_late_minutes',
                'lates_per_absent', 'auto_mark_absent', 'missing_punch_as_absent',
            ]);
        });
    }
};
