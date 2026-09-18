<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = ['tax_brackets', 'salary_grades', 'loan_advances'];

    public function up(): void
    {
        // tax_brackets, salary_grades and loan_advances all had company_id
        // created as unsignedBigInteger but the companies table uses uuid
        // as primary key — change to char(36), same fix already applied to
        // audit_logs and background_runs.
        // Raw MODIFY is MySQL-only syntax; other drivers (sqlite, used by the
        // test suite) need the portable column-change builder instead.
        $isMysql = Schema::getConnection()->getDriverName() === 'mysql';

        foreach (self::TABLES as $table) {
            if ($isMysql) {
                DB::statement("ALTER TABLE {$table} MODIFY company_id CHAR(36) NULL");
            } else {
                Schema::table($table, function (Blueprint $t) {
                    $t->char('company_id', 36)->nullable()->change();
                });
            }
        }
    }

    public function down(): void
    {
        $isMysql = Schema::getConnection()->getDriverName() === 'mysql';

        foreach (self::TABLES as $table) {
            if ($isMysql) {
                DB::statement("ALTER TABLE {$table} MODIFY company_id BIGINT UNSIGNED NULL");
            } else {
                Schema::table($table, function (Blueprint $t) {
                    $t->unsignedBigInteger('company_id')->nullable()->change();
                });
            }
        }
    }
};
