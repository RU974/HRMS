<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table): void {
            $table->unsignedSmallInteger('notice_period_days')->default(0)->after('max_request_days');
            $table->boolean('allow_half_day')->default(false)->after('notice_period_days');
            $table->boolean('encashable')->default(false)->after('allow_half_day');
        });
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table): void {
            $table->dropColumn(['notice_period_days', 'allow_half_day', 'encashable']);
        });
    }
};
