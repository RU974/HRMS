<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('biometric_device_commands')) {
            Schema::create('biometric_device_commands', function (Blueprint $table) {
                $table->id();
                $table->foreignId('device_id')->constrained('biometric_devices')->cascadeOnDelete();
                $table->string('company_id')->nullable()->index();
                $table->string('type', 30); // add_user | remove_user
                $table->string('device_user_id');
                $table->json('payload')->nullable();
                $table->string('status', 20)->default('pending'); // pending | sent | done | failed
                $table->text('result_message')->nullable();
                $table->unsignedBigInteger('requested_by')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();

                $table->index(['device_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_device_commands');
    }
};
