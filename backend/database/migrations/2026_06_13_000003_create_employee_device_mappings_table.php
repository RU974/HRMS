<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('employee_device_mappings')) {
            Schema::create('employee_device_mappings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
                $table->foreignId('device_id')->constrained('biometric_devices')->cascadeOnDelete();
                $table->string('device_user_id');
                $table->string('card_number')->nullable();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();

                $table->unique(['device_id', 'device_user_id'], 'device_user_unique');
                $table->unique(['employee_id', 'device_id'], 'employee_device_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_device_mappings');
    }
};