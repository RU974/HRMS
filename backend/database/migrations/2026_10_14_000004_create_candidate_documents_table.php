<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_documents', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreignId('candidate_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('status', 20)->default('requested'); // requested, uploaded, verified, rejected
            $table->string('file_path')->nullable();
            $table->string('original_name')->nullable();
            $table->string('mime_type', 100)->nullable();
            $table->unsignedInteger('size')->nullable();
            $table->string('uploaded_by_type', 20)->nullable(); // candidate, staff
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('review_note')->nullable();
            $table->timestamp('uploaded_at')->nullable();
            $table->timestamps();

            $table->index(['candidate_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_documents');
    }
};
