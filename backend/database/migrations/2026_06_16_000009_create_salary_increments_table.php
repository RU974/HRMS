<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('salary_increments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('effective_date');
            $table->decimal('old_salary', 15, 2);
            $table->decimal('new_salary', 15, 2);
            $table->decimal('increment_percent', 6, 2)->storedAs('ROUND((new_salary - old_salary) / NULLIF(old_salary,0) * 100, 2)');
            $table->string('reason', 200)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'effective_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salary_increments');
    }
};
