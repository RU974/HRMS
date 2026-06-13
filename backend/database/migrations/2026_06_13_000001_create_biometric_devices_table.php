<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('biometric_devices')) {
            Schema::create('biometric_devices', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->enum('connection_type', ['tcp', 'cloud_api'])->default('tcp');

                // TCP/IP device fields
                $table->string('ip_address')->nullable();
                $table->unsignedInteger('port')->nullable();
                $table->string('comm_key')->nullable();
                $table->string('device_model')->nullable();

                // Cloud API fields
                $table->string('api_endpoint')->nullable();
                $table->text('api_key')->nullable();

                // Sync settings
                $table->enum('sync_mode', ['realtime', 'scheduled'])->default('scheduled');
                $table->unsignedInteger('sync_interval_minutes')->nullable()->default(15);
                $table->string('timezone')->default('Asia/Karachi');

                // Status
                $table->enum('status', ['online', 'offline', 'never_synced'])->default('never_synced');
                $table->timestamp('last_sync_at')->nullable();

                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_devices');
    }
};