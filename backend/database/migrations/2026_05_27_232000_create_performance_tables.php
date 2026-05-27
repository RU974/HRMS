<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->string('period', 100);
            $table->unsignedTinyInteger('rating')->default(3);
            $table->text('summary')->nullable();
            $table->timestamps();

            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
            $table->foreign('reviewer_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['employee_id', 'period']);
        });

        Schema::create('performance_kpis', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('name');
            $table->decimal('target_value', 10, 2)->default(0);
            $table->decimal('current_value', 10, 2)->default(0);
            $table->string('unit', 50)->default('%');
            $table->timestamps();

            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
            $table->index(['employee_id', 'name']);
        });

        Schema::create('performance_goals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('title');
            $table->text('description')->nullable();
            $table->date('due_date')->nullable();
            $table->enum('status', ['not_started', 'in_progress', 'completed', 'on_hold'])->default('not_started');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->timestamps();

            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
            $table->index(['employee_id', 'status', 'due_date']);
        });

        Schema::create('performance_appraisals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->string('cycle', 100);
            $table->unsignedTinyInteger('overall_score')->default(3);
            $table->text('strengths')->nullable();
            $table->text('improvements')->nullable();
            $table->timestamps();

            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
            $table->foreign('reviewer_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['employee_id', 'cycle']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_appraisals');
        Schema::dropIfExists('performance_goals');
        Schema::dropIfExists('performance_kpis');
        Schema::dropIfExists('performance_reviews');
    }
};

