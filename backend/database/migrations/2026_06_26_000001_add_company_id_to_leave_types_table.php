<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->char('company_id', 36)
                ->nullable()
                ->after('id');

            $table->foreign('company_id')
                ->references('id')
                ->on('companies')
                ->cascadeOnDelete();

            // Drop the old global unique index on name alone
            $table->dropUnique(['name']);

            // Name must be unique per company
            $table->unique(['company_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->dropUnique(['company_id', 'name']);
            $table->dropForeign(['company_id']);
            $table->dropColumn('company_id');
            $table->unique('name');
        });
    }
};
