<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('holidays', function (Blueprint $table) {
            $table->char('company_id', 36)->nullable()->after('id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->dropUnique('holidays_holiday_date_unique');
            $table->unique(['company_id', 'holiday_date']);
        });

        Schema::table('shifts', function (Blueprint $table) {
            $table->char('company_id', 36)->nullable()->after('id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->dropUnique('shifts_name_unique');
            $table->unique(['company_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'name']);
            $table->dropForeign(['company_id']);
            $table->dropColumn('company_id');
            $table->unique('name');
        });

        Schema::table('holidays', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'holiday_date']);
            $table->dropForeign(['company_id']);
            $table->dropColumn('company_id');
            $table->unique('holiday_date');
        });
    }
};
