<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_opening_id')->constrained()->cascadeOnDelete();
            $table->string('full_name');
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('resume_path')->nullable();
            $table->string('source')->nullable();
            $table->string('stage')->default('applied');
            $table->unsignedTinyInteger('rating')->nullable();
            $table->string('status')->default('active');
            $table->date('applied_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['job_opening_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidates');
    }
};
