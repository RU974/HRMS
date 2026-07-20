<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // background_runs.company_id was created as unsignedBigInteger but the
        // companies table uses uuid as primary key — change to char(36).
        DB::statement('ALTER TABLE background_runs MODIFY company_id CHAR(36) NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE background_runs MODIFY company_id BIGINT UNSIGNED NULL');
    }
};
