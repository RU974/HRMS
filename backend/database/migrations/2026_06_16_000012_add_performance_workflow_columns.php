<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('performance_appraisals', function (Blueprint $table) {
            $table->unsignedBigInteger('template_id')->nullable()->after('reviewer_id');
            $table->string('status', 20)->default('draft')->after('overall_score');
            $table->foreign('template_id')->references('id')->on('performance_review_templates')->nullOnDelete();
            $table->index('status');
        });

        Schema::table('performance_reviews', function (Blueprint $table) {
            $table->unsignedBigInteger('template_id')->nullable()->after('reviewer_id');
            $table->foreign('template_id')->references('id')->on('performance_review_templates')->nullOnDelete();
        });

        Schema::table('salary_increments', function (Blueprint $table) {
            $table->unsignedBigInteger('appraisal_id')->nullable()->after('employee_id');
            $table->foreign('appraisal_id')->references('id')->on('performance_appraisals')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('salary_increments', function (Blueprint $table) {
            $table->dropForeign(['appraisal_id']);
            $table->dropColumn('appraisal_id');
        });

        Schema::table('performance_reviews', function (Blueprint $table) {
            $table->dropForeign(['template_id']);
            $table->dropColumn('template_id');
        });

        Schema::table('performance_appraisals', function (Blueprint $table) {
            $table->dropForeign(['template_id']);
            $table->dropColumn(['template_id', 'status']);
        });
    }
};
