<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->nullable()->constrained('chat_conversations')->nullOnDelete();
            $table->foreignId('initiated_by')->constrained('users')->cascadeOnDelete();
            $table->string('type')->default('audio'); // audio | video
            $table->string('call_type')->default('direct'); // direct | group
            $table->string('status')->default('ringing'); // ringing | active | ended | missed
            $table->foreignUuid('company_id')->constrained('companies')->cascadeOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['initiated_by', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calls');
    }
};
