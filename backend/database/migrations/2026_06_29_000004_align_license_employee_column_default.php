<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            // Align the DB-level column default with the Starter edition default
            // in config/licenses.php (20 employees) so raw inserts that omit the
            // value behave consistently with what LicenseService::create() applies.
            // max_users stays null (unlimited) — already set by migration 000001.
            $table->unsignedInteger('max_employees')->nullable()->default(20)->change();
        });
    }

    public function down(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->unsignedInteger('max_employees')->nullable()->default(null)->change();
        });
    }
};
