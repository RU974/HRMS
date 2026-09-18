<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // background_runs.company_id was created as unsignedBigInteger but the
        // companies table uses uuid as primary key — change to char(36).
        // Raw MODIFY is MySQL-only syntax; other drivers (sqlite, used by the
        // test suite) need the portable column-change builder instead.
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE background_runs MODIFY company_id CHAR(36) NULL');
        } else {
            Schema::table('background_runs', function (Blueprint $table) {
                $table->char('company_id', 36)->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE background_runs MODIFY company_id BIGINT UNSIGNED NULL');
        } else {
            Schema::table('background_runs', function (Blueprint $table) {
                $table->unsignedBigInteger('company_id')->nullable()->change();
            });
        }
    }
};
