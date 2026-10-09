<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shift_department_graces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shift_id')->constrained('shifts')->cascadeOnDelete();
            $table->foreignId('department_id')->constrained('departments')->cascadeOnDelete();
            $table->unsignedSmallInteger('grace_minutes')->default(0);
            $table->timestamps();

            $table->unique(['shift_id', 'department_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shift_department_graces');
    }
};
