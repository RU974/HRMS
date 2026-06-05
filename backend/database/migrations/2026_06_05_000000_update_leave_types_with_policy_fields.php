<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->string('accrual_frequency')->default('yearly')->after('default_days');
            $table->unsignedSmallInteger('accrual_amount')->default(0)->after('accrual_frequency');
            $table->unsignedSmallInteger('carry_forward_days')->default(0)->after('is_active');
            $table->unsignedSmallInteger('max_balance')->default(0)->after('carry_forward_days');
            $table->unsignedTinyInteger('required_approval_levels')->default(1)->after('max_balance');
            $table->unsignedSmallInteger('min_request_days')->default(1)->after('required_approval_levels');
            $table->unsignedSmallInteger('max_request_days')->default(0)->after('min_request_days');
        });
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->dropColumn([
                'accrual_frequency',
                'accrual_amount',
                'carry_forward_days',
                'max_balance',
                'required_approval_levels',
                'min_request_days',
                'max_request_days',
            ]);
        });
    }
};
