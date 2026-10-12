<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            // The currency headcount budgets are set in. Jobs and offers in other currencies are converted into it.
            $table->string('base_currency', 10)->default('PKR');
        });

        Schema::create('company_currency_rates', function (Blueprint $table) {
            $table->id();
            $table->uuid('company_id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->string('currency', 10);
            // How many units of the company's base currency one unit of this currency is worth.
            $table->decimal('rate', 18, 6);
            $table->timestamps();

            $table->unique(['company_id', 'currency']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_currency_rates');

        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('base_currency');
        });
    }
};
