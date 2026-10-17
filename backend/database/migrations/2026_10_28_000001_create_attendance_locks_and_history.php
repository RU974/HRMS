<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A month an admin has closed for the whole company. Payroll closes months on its own too
        // (see AttendancePeriodGuard); this table is the manual lock.
        if (! Schema::hasTable('attendance_period_locks')) {
            Schema::create('attendance_period_locks', function (Blueprint $table) {
                $table->id();
                $table->string('company_id')->index();
                $table->unsignedSmallInteger('year');
                $table->unsignedTinyInteger('month');
                $table->unsignedBigInteger('locked_by')->nullable();
                $table->timestamp('locked_at')->nullable();
                $table->string('reason', 500)->nullable();
                $table->timestamps();

                $table->unique(['company_id', 'year', 'month']);
            });
        }

        // One row per change to an attendance record. attendance_id has no foreign key on purpose:
        // the history of a deleted record must outlive it.
        if (! Schema::hasTable('attendance_histories')) {
            Schema::create('attendance_histories', function (Blueprint $table) {
                $table->id();
                $table->string('company_id')->nullable();
                $table->unsignedBigInteger('attendance_id')->nullable()->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->date('date');
                $table->string('action', 16); // created | updated | deleted
                $table->json('changes')->nullable(); // { field: [old, new] }
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('source', 32); // manual | system | biometric | leave | auto_absent | recalculation | schedule | import
                $table->string('reason', 500)->nullable();
                $table->timestamp('created_at')->nullable();

                $table->index(['company_id', 'date']);
            });
        }

        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) {
                if (! Schema::hasColumn('attendances', 'edited_by')) {
                    $table->unsignedBigInteger('edited_by')->nullable();
                }
                if (! Schema::hasColumn('attendances', 'edited_at')) {
                    $table->timestamp('edited_at')->nullable();
                }
                if (! Schema::hasColumn('attendances', 'edited_source')) {
                    $table->string('edited_source', 32)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('attendances')) {
            Schema::table('attendances', function (Blueprint $table) {
                foreach (['edited_by', 'edited_at', 'edited_source'] as $column) {
                    if (Schema::hasColumn('attendances', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
        Schema::dropIfExists('attendance_histories');
        Schema::dropIfExists('attendance_period_locks');
    }
};
