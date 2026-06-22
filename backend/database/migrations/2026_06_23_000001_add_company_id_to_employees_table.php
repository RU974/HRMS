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

        // Backfill from users table
        DB::statement('
            UPDATE employees e
            JOIN users u ON u.id = e.user_id
            SET e.company_id = u.company_id
            WHERE e.company_id IS NULL
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
