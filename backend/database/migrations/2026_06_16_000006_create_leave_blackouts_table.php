<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_blackouts', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->date('start_date');
            $table->date('end_date');
            $table->foreignId('leave_type_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_blackouts');
    }
};
