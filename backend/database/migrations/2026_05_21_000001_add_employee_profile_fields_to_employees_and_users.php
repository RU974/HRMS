<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'username')) {
                $table->string('username')->nullable()->unique()->after('email');
            }
        });

        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'first_name')) {
                $table->string('first_name')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('employees', 'last_name')) {
                $table->string('last_name')->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('employees', 'cnic')) {
                $table->string('cnic')->nullable()->after('phone');
            }
            if (!Schema::hasColumn('employees', 'date_of_birth')) {
                $table->date('date_of_birth')->nullable()->after('cnic');
            }
            if (!Schema::hasColumn('employees', 'gender')) {
                $table->enum('gender', ['male', 'female', 'other'])->nullable()->after('date_of_birth');
            }
            if (!Schema::hasColumn('employees', 'address')) {
                $table->text('address')->nullable()->after('gender');
            }
            if (!Schema::hasColumn('employees', 'employee_number')) {
                $table->string('employee_number')->nullable()->unique()->after('address');
            }
            if (!Schema::hasColumn('employees', 'joining_date')) {
                $table->date('joining_date')->nullable()->after('employee_number');
            }
            if (!Schema::hasColumn('employees', 'employment_type')) {
                $table->string('employment_type')->nullable()->after('joining_date');
            }
            if (!Schema::hasColumn('employees', 'shift_id')) {
                $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete()->after('employment_type');
            }
            if (!Schema::hasColumn('employees', 'manager_id')) {
                $table->foreignId('manager_id')->nullable()->constrained('employees')->nullOnDelete()->after('shift_id');
            }
            if (!Schema::hasColumn('employees', 'basic_salary')) {
                $table->decimal('basic_salary', 12, 2)->default(0)->after('designation');
            }
            if (!Schema::hasColumn('employees', 'allowances')) {
                $table->decimal('allowances', 12, 2)->default(0)->after('basic_salary');
            }
            if (!Schema::hasColumn('employees', 'profile_image')) {
                $table->string('profile_image')->nullable()->after('allowances');
            }
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'profile_image')) {
                $table->dropColumn('profile_image');
            }
            if (Schema::hasColumn('employees', 'allowances')) {
                $table->dropColumn('allowances');
            }
            if (Schema::hasColumn('employees', 'basic_salary')) {
                $table->dropColumn('basic_salary');
            }
            if (Schema::hasColumn('employees', 'manager_id')) {
                $table->dropForeign(['manager_id']);
                $table->dropColumn('manager_id');
            }
            if (Schema::hasColumn('employees', 'shift_id')) {
                $table->dropForeign(['shift_id']);
                $table->dropColumn('shift_id');
            }
            if (Schema::hasColumn('employees', 'employment_type')) {
                $table->dropColumn('employment_type');
            }
            if (Schema::hasColumn('employees', 'joining_date')) {
                $table->dropColumn('joining_date');
            }
            if (Schema::hasColumn('employees', 'employee_number')) {
                $table->dropUnique(['employee_number']);
                $table->dropColumn('employee_number');
            }
            if (Schema::hasColumn('employees', 'address')) {
                $table->dropColumn('address');
            }
            if (Schema::hasColumn('employees', 'gender')) {
                $table->dropColumn('gender');
            }
            if (Schema::hasColumn('employees', 'date_of_birth')) {
                $table->dropColumn('date_of_birth');
            }
            if (Schema::hasColumn('employees', 'cnic')) {
                $table->dropColumn('cnic');
            }
            if (Schema::hasColumn('employees', 'last_name')) {
                $table->dropColumn('last_name');
            }
            if (Schema::hasColumn('employees', 'first_name')) {
                $table->dropColumn('first_name');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'username')) {
                $table->dropUnique(['username']);
                $table->dropColumn('username');
            }
        });
    }
};
