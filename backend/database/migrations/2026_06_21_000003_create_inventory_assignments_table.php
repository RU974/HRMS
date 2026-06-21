<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('item_id')->index();
            $table->unsignedBigInteger('employee_id')->index();
            $table->integer('quantity')->default(1);
            $table->date('assigned_date');
            $table->date('returned_date')->nullable();
            $table->enum('status', ['assigned', 'returned'])->default('assigned');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('item_id')->references('id')->on('inventory_items')->cascadeOnDelete();
            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_assignments');
    }
};
