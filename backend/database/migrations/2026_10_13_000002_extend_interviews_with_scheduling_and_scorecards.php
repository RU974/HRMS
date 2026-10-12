<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('interviews', function (Blueprint $table) {
            $table->foreignId('interviewer_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedSmallInteger('duration_minutes')->default(60);
            $table->string('location')->nullable();
            $table->string('meeting_link', 500)->nullable();
            $table->string('status', 20)->default('scheduled');
            $table->text('cancel_reason')->nullable();
            $table->timestamp('scorecard_reminded_at')->nullable();

            $table->index(['interviewer_id', 'scheduled_at']);
        });

        Schema::create('interview_scorecards', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('interview_id')->constrained()->cascadeOnDelete();
            $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->string('recommendation', 20);
            $table->text('strengths')->nullable();
            $table->text('concerns')->nullable();
            $table->timestamps();

            $table->unique(['interview_id', 'submitted_by']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interview_scorecards');

        Schema::table('interviews', function (Blueprint $table) {
            $table->dropIndex(['interviewer_id', 'scheduled_at']);
            $table->dropConstrainedForeignId('interviewer_id');
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['duration_minutes', 'location', 'meeting_link', 'status', 'cancel_reason', 'scorecard_reminded_at']);
        });
    }
};
