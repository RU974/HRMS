<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('biometric_sync_logs')) {
            Schema::create('biometric_sync_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('device_id')->constrained('biometric_devices')->cascadeOnDelete();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->unsignedInteger('records_fetched')->default(0);
                $table->unsignedInteger('records_matched')->default(0);
                $table->unsignedInteger('records_unmatched')->default(0);
                $table->enum('status', ['success', 'partial', 'failed', 'in_progress'])->default('in_progress');
                $table->text('error_message')->nullable();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_sync_logs');
    }
};