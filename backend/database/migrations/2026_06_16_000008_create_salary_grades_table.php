<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('salary_grades', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->string('name', 120);
            $table->decimal('min_salary', 15, 2)->default(0);
            $table->decimal('max_salary', 15, 2)->default(0);
            $table->decimal('basic_percent', 5, 2)->default(50)->comment('% of gross as basic');
            $table->decimal('hra_percent', 5, 2)->default(20)->comment('% of basic as HRA');
            $table->decimal('transport_allowance', 15, 2)->default(0);
            $table->decimal('other_allowance', 15, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salary_grades');
    }
};
