<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_openings', function (Blueprint $table) {
            $table->foreignId('hiring_manager_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('recruiter_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('salary_min', 12, 2)->nullable();
            $table->decimal('salary_max', 12, 2)->nullable();
            $table->string('salary_currency', 10)->nullable();
            $table->text('requirements')->nullable();
            $table->boolean('is_public')->default(false);
        });

        Schema::table('companies', function (Blueprint $table) {
            $table->string('careers_slug', 80)->nullable()->unique();
            $table->boolean('careers_enabled')->default(false);
            $table->text('careers_intro')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropUnique(['careers_slug']);
            $table->dropColumn(['careers_slug', 'careers_enabled', 'careers_intro']);
        });

        Schema::table('job_openings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('hiring_manager_id');
            $table->dropConstrainedForeignId('recruiter_id');
            $table->dropColumn(['salary_min', 'salary_max', 'salary_currency', 'requirements', 'is_public']);
        });
    }
};
