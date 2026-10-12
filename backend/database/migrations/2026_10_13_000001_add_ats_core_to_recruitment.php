<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            if (! Schema::hasColumn('candidates', 'rejection_reason')) {
                $table->text('rejection_reason')->nullable();
            }
            if (! Schema::hasColumn('candidates', 'tags')) {
                $table->json('tags')->nullable();
            }
            if (! Schema::hasColumn('candidates', 'resume_original_name')) {
                $table->string('resume_original_name')->nullable();
            }
        });

        Schema::create('candidate_stage_histories', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->string('from_stage')->nullable();
            $table->string('to_stage');
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'created_at']);
        });

        Schema::create('candidate_notes', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_notes');
        Schema::dropIfExists('candidate_stage_histories');

        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn(['rejection_reason', 'tags', 'resume_original_name']);
        });
    }
};
