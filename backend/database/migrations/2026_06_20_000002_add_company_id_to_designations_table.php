<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('designations', function (Blueprint $table) {
            $table->uuid('company_id')->nullable()->after('id')->index();
        });

        // Drop the global unique constraint on name; uniqueness is now per company
        Schema::table('designations', function (Blueprint $table) {
            $table->dropUnique(['name']);
            $table->unique(['company_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('designations', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'name']);
            $table->unique(['name']);
            $table->dropColumn('company_id');
        });
    }
};
