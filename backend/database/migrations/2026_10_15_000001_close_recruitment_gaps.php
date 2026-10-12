<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            // Fit against the job's requirements.
            $table->unsignedTinyInteger('fit_score')->nullable()->index();
            $table->json('fit_breakdown')->nullable();
            $table->timestamp('fit_scored_at')->nullable();

            // Resumes the parser could not read (scanned images, damaged files) are flagged for a human.
            $table->string('resume_review_reason', 60)->nullable();

            // Duplicate merge and withdrawal.
            $table->json('merged_from')->nullable();
            $table->timestamp('withdrawn_at')->nullable();

            // Talent pool consent and retention.
            $table->string('pool_consent', 20)->nullable(); // unconfirmed, pending, granted, declined
            $table->timestamp('pool_consent_requested_at')->nullable();
            $table->timestamp('pool_consent_at')->nullable();
            $table->timestamp('talent_pool_expires_at')->nullable()->index();
            $table->timestamp('anonymized_at')->nullable();
        });

        Schema::table('companies', function (Blueprint $table) {
            $table->decimal('requisition_cost_threshold', 14, 2)->nullable();
            // Months a person stays in the talent pool before they leave it; null keeps them until removed.
            $table->unsignedSmallInteger('talent_pool_retention_months')->nullable()->default(12);
            // Months after which rejected/withdrawn candidate data is erased; null never erases automatically.
            $table->unsignedSmallInteger('candidate_retention_months')->nullable();
        });

        Schema::table('job_openings', function (Blueprint $table) {
            $table->decimal('estimated_cost', 14, 2)->nullable();
            $table->json('budget_check')->nullable();
        });

        Schema::table('offers', function (Blueprint $table) {
            // E-signature evidence: what was signed, by whom, from where, after proving control of the email address.
            $table->string('sign_code_hash', 64)->nullable();
            $table->timestamp('sign_code_expires_at')->nullable();
            $table->unsignedTinyInteger('sign_code_attempts')->default(0);
            $table->string('document_hash', 64)->nullable();
            $table->json('signature_record')->nullable();
        });

        Schema::create('candidate_messages', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->string('direction', 10); // candidate, staff
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'id']);
        });

        Schema::create('interview_reschedule_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->foreignId('interview_id')->constrained()->cascadeOnDelete();
            $table->text('note')->nullable();
            $table->json('proposed_times')->nullable();
            $table->string('status', 20)->default('pending'); // pending, resolved, declined
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution_note')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['interview_id', 'status']);
        });

        Schema::create('recruitment_email_templates', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->string('name', 120);
            $table->string('subject', 200);
            $table->text('body');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('headcount_budgets', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('fiscal_year');
            $table->unsignedInteger('approved_headcount');
            $table->decimal('approved_budget', 14, 2)->nullable();
            $table->timestamps();

            $table->unique(['department_id', 'fiscal_year']);
        });

        Schema::create('candidate_bulk_runs', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 30);
            $table->json('params')->nullable();
            $table->json('filters')->nullable();
            $table->json('exclude_ids')->nullable();
            $table->string('status', 20)->default('queued'); // queued, running, done, failed
            $table->unsignedInteger('total')->default(0);
            $table->unsignedInteger('processed')->default(0);
            $table->unsignedInteger('succeeded_count')->default(0);
            $table->json('failed')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_bulk_runs');
        Schema::dropIfExists('headcount_budgets');
        Schema::dropIfExists('recruitment_email_templates');
        Schema::dropIfExists('interview_reschedule_requests');
        Schema::dropIfExists('candidate_messages');

        Schema::table('offers', function (Blueprint $table) {
            $table->dropColumn(['sign_code_hash', 'sign_code_expires_at', 'sign_code_attempts', 'document_hash', 'signature_record']);
        });

        Schema::table('job_openings', function (Blueprint $table) {
            $table->dropColumn(['estimated_cost', 'budget_check']);
        });

        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['requisition_cost_threshold', 'talent_pool_retention_months', 'candidate_retention_months']);
        });

        Schema::table('candidates', function (Blueprint $table) {
            $table->dropIndex(['fit_score']);
            $table->dropIndex(['talent_pool_expires_at']);
            $table->dropColumn([
                'fit_score', 'fit_breakdown', 'fit_scored_at', 'resume_review_reason', 'merged_from', 'withdrawn_at',
                'pool_consent', 'pool_consent_requested_at', 'pool_consent_at', 'talent_pool_expires_at', 'anonymized_at',
            ]);
        });
    }
};
