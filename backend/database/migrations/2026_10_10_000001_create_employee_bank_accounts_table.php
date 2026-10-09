<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('employee_bank_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->unique()->constrained()->cascadeOnDelete();
            $table->uuid('company_id')->nullable()->index();
            $table->string('account_holder_name', 200);
            $table->string('bank_name', 200);
            $table->string('branch_name', 200)->nullable();
            $table->text('account_number')->comment('Encrypted at rest');
            $table->text('iban')->nullable()->comment('Encrypted at rest');
            $table->string('swift_code', 20)->nullable();
            $table->string('routing_code', 30)->nullable()->comment('Sort code / IFSC / routing number');
            $table->string('account_type', 20)->default('savings')->comment('savings|current|salary');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_bank_accounts');
    }
};
