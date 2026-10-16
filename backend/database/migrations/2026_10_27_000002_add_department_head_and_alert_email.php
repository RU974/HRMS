<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('departments') && ! Schema::hasColumn('departments', 'head_employee_id')) {
            Schema::table('departments', function (Blueprint $table) {
                // The employee who heads the department; hears about attendance exceptions of its people.
                $table->unsignedBigInteger('head_employee_id')->nullable()->index();
            });
        }

        if (Schema::hasTable('attendance_policies') && ! Schema::hasColumn('attendance_policies', 'alerts_email')) {
            Schema::table('attendance_policies', function (Blueprint $table) {
                // Also email attendance alerts. Off by default.
                $table->boolean('alerts_email')->default(false);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('departments', 'head_employee_id')) {
            Schema::table('departments', fn (Blueprint $t) => $t->dropColumn('head_employee_id'));
        }
        if (Schema::hasColumn('attendance_policies', 'alerts_email')) {
            Schema::table('attendance_policies', fn (Blueprint $t) => $t->dropColumn('alerts_email'));
        }
    }
};
