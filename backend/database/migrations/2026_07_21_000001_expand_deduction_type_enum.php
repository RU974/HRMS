<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The deductions.type column was created with only ('tax','loan','penalty','other'),
 * but DeductionController validation and the frontend deduction form both offer
 * provident_fund, pension, esi, and professional_tax — every one of those
 * selections fails with a SQL error on insert because the enum rejects them.
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        $types = "'tax','loan','penalty','provident_fund','pension','esi','professional_tax','other'";

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE deductions MODIFY type ENUM($types) NOT NULL DEFAULT 'other'");
        } else {
            Schema::table('deductions', function (Blueprint $table) {
                $table->string('type')->default('other')->change();
            });
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE deductions MODIFY type ENUM('tax','loan','penalty','other') NOT NULL DEFAULT 'other'");
        } else {
            Schema::table('deductions', function (Blueprint $table) {
                $table->string('type')->default('other')->change();
            });
        }
    }
};
