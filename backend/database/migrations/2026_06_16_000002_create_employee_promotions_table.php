<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_promotions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('promotion'); // promotion | transfer | demotion | grade_change
            $table->string('from_designation')->nullable();
            $table->string('to_designation')->nullable();
            $table->string('from_department')->nullable();
            $table->string('to_department')->nullable();
            $table->decimal('from_salary', 12, 2)->nullable();
            $table->decimal('to_salary', 12, 2)->nullable();
            $table->date('effective_date');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_promotions');
    }
};
