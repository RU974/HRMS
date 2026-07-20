<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('tax_brackets', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->nullable()->index();
            $table->string('name', 120);
            $table->decimal('min_income', 15, 2)->default(0);
            $table->decimal('max_income', 15, 2)->nullable()->comment('NULL means no upper limit');
            $table->decimal('rate', 5, 2)->comment('Percentage e.g. 10.00 = 10%');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['company_id', 'min_income']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tax_brackets');
    }
};
