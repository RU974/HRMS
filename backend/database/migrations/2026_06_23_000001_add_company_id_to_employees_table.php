<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('company_id')->nullable()->after('id');
            $table->index('company_id');
        });

        // Backfill from users table (subquery form works on both MySQL and
        // SQLite — the previous multi-table UPDATE...JOIN syntax is MySQL-only
        // and broke every RefreshDatabase-based test, which runs on SQLite).
        DB::statement('
            UPDATE employees
            SET company_id = (SELECT company_id FROM users WHERE users.id = employees.user_id)
            WHERE company_id IS NULL
        ');
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['company_id']);
            $table->dropColumn('company_id');
        });
    }
};
