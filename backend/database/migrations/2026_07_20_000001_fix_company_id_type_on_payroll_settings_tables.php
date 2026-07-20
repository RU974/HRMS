<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // tax_brackets, salary_grades and loan_advances all had company_id
        // created as unsignedBigInteger but the companies table uses uuid
        // as primary key — change to char(36), same fix already applied to
        // audit_logs and background_runs.
        DB::statement('ALTER TABLE tax_brackets MODIFY company_id CHAR(36) NULL');
        DB::statement('ALTER TABLE salary_grades MODIFY company_id CHAR(36) NULL');
        DB::statement('ALTER TABLE loan_advances MODIFY company_id CHAR(36) NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE tax_brackets MODIFY company_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE salary_grades MODIFY company_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE loan_advances MODIFY company_id BIGINT UNSIGNED NULL');
    }
};
