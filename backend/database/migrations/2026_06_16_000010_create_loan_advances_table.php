<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('loan_advances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->string('title', 200);
            $table->decimal('amount', 15, 2);
            $table->decimal('outstanding_balance', 15, 2);
            $table->decimal('emi_amount', 15, 2)->nullable()->comment('Monthly EMI auto-deducted from payroll');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->string('status', 20)->default('active')->comment('active|completed|cancelled');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_advances');
    }
};
