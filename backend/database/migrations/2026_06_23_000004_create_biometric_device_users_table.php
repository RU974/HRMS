<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('biometric_device_users')) {
            Schema::create('biometric_device_users', function (Blueprint $table) {
                $table->id();
                $table->foreignId('device_id')->constrained('biometric_devices')->cascadeOnDelete();
                $table->string('device_user_id');
                $table->string('name')->nullable();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();

                $table->unique(['device_id', 'device_user_id'], 'bio_device_user_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_device_users');
    }
};
