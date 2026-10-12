<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function companyColumn(Blueprint $table): void
    {
        $table->uuid('company_id')->nullable()->index();
        $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
    }

    public function up(): void
    {
        // Custom pipeline stages. Each stage belongs to one of the built-in categories
        // (applied, screening, interview, offer) so reports, rules and automations keep working.
        // job_opening_id null = the company default pipeline; a job with its own rows overrides it.
        Schema::create('pipeline_stages', function (Blueprint $table) {
            $table->id();
            $this->companyColumn($table);
            $table->foreignId('job_opening_id')->nullable()->constrained('job_openings')->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('category', 20);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_skippable')->default(false);
            $table->timestamps();

            $table->index(['company_id', 'job_opening_id', 'sort_order']);
        });

        Schema::create('recruitment_agencies', function (Blueprint $table) {
            $table->id();
            $this->companyColumn($table);
            $table->string('name', 160);
            $table->string('contact_name', 160)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('phone', 50)->nullable();
            $table->decimal('fee_percent', 5, 2)->nullable();
            $table->text('terms')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('candidates', function (Blueprint $table) {
            $table->foreignId('pipeline_stage_id')->nullable()->constrained('pipeline_stages')->nullOnDelete();
            // careers, referral, agency, direct, import, other
            $table->string('source_type', 20)->nullable()->index();
            $table->foreignId('referrer_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('recruitment_agencies')->nullOnDelete();
            // Set when an answer tripped a knockout rule, whether or not the application was auto-rejected.
            $table->boolean('knockout_failed')->default(false);
        });

        Schema::table('candidate_stage_histories', function (Blueprint $table) {
            // Stage names as they were at the time, because custom stages can be renamed or removed later.
            $table->string('from_label', 80)->nullable();
            $table->string('to_label', 80)->nullable();
            $table->unsignedBigInteger('from_pipeline_stage_id')->nullable();
            $table->unsignedBigInteger('to_pipeline_stage_id')->nullable();
        });

        Schema::table('job_openings', function (Blueprint $table) {
            // Check types (reference, background, assessment) that must be cleared before a hire.
            $table->json('required_checks')->nullable();
            // When true an application that trips a knockout rule is rejected on the spot.
            $table->boolean('auto_reject_knockouts')->default(true);
            $table->decimal('referral_bonus_amount', 14, 2)->nullable();
        });

        Schema::table('companies', function (Blueprint $table) {
            $table->decimal('referral_bonus_amount', 14, 2)->nullable();
            $table->unsignedSmallInteger('referral_bonus_wait_days')->default(90);
        });

        Schema::create('job_questions', function (Blueprint $table) {
            $table->id();
            $this->companyColumn($table);
            $table->foreignId('job_opening_id')->constrained('job_openings')->cascadeOnDelete();
            $table->string('label', 300);
            $table->string('help_text', 300)->nullable();
            // text, textarea, number, yes_no, single_choice, multi_choice, date
            $table->string('type', 20);
            $table->json('options')->nullable();
            $table->boolean('required')->default(false);
            // {operator: eq|neq|gte|lte|in|not_in|contains_none, value: ...}; null = not a knockout question.
            $table->json('knockout')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['job_opening_id', 'sort_order']);
        });

        Schema::create('candidate_answers', function (Blueprint $table) {
            $table->id();
            $this->companyColumn($table);
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->foreignId('job_question_id')->nullable()->constrained('job_questions')->nullOnDelete();
            // The wording at the time of answering, in case the question is edited or removed afterwards.
            $table->string('question', 300);
            $table->string('type', 20);
            $table->json('answer')->nullable();
            $table->boolean('knocked_out')->default(false);
            $table->timestamps();

            $table->index('candidate_id');
        });

        Schema::create('referral_bonuses', function (Blueprint $table) {
            $table->id();
            $this->companyColumn($table);
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('recruitment_agencies')->nullOnDelete();
            $table->decimal('amount', 14, 2)->nullable();
            $table->string('currency', 10)->nullable();
            // tracking (candidate not hired yet), pending (hired, waiting out the retention period),
            // eligible, approved (payroll bonus created for employees), paid, cancelled
            $table->string('status', 20)->default('tracking');
            $table->date('eligible_on')->nullable();
            $table->date('paid_on')->nullable();
            $table->foreignId('bonus_id')->nullable()->constrained('bonuses')->nullOnDelete();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique('candidate_id');
            $table->index(['company_id', 'status']);
        });

        Schema::create('candidate_checks', function (Blueprint $table) {
            $table->id();
            $this->companyColumn($table);
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            // reference, background, assessment
            $table->string('type', 20);
            $table->string('title', 200);
            // requested, in_progress, passed, failed, waived
            $table->string('status', 20)->default('requested');
            $table->string('provider', 160)->nullable();
            $table->string('contact_name', 160)->nullable();
            $table->string('contact_email', 255)->nullable();
            $table->string('contact_phone', 50)->nullable();
            $table->string('relationship', 160)->nullable();
            $table->date('due_on')->nullable();
            $table->decimal('score', 8, 2)->nullable();
            $table->decimal('max_score', 8, 2)->nullable();
            $table->decimal('pass_mark', 8, 2)->nullable();
            $table->text('result_notes')->nullable();
            $table->json('response')->nullable();
            $table->string('response_token_hash', 64)->nullable()->index();
            $table->timestamp('response_token_expires_at')->nullable();
            $table->foreignId('document_id')->nullable()->constrained('candidate_documents')->nullOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('waive_reason', 500)->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_checks');
        Schema::dropIfExists('referral_bonuses');
        Schema::dropIfExists('candidate_answers');
        Schema::dropIfExists('job_questions');

        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['referral_bonus_amount', 'referral_bonus_wait_days']);
        });

        Schema::table('job_openings', function (Blueprint $table) {
            $table->dropColumn(['required_checks', 'auto_reject_knockouts', 'referral_bonus_amount']);
        });

        Schema::table('candidate_stage_histories', function (Blueprint $table) {
            $table->dropColumn(['from_label', 'to_label', 'from_pipeline_stage_id', 'to_pipeline_stage_id']);
        });

        Schema::table('candidates', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pipeline_stage_id');
            $table->dropConstrainedForeignId('referrer_employee_id');
            $table->dropConstrainedForeignId('agency_id');
            $table->dropColumn(['source_type', 'knockout_failed']);
        });

        Schema::dropIfExists('recruitment_agencies');
        Schema::dropIfExists('pipeline_stages');
    }
};
