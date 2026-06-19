<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('call_signals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('call_id')->constrained('calls')->cascadeOnDelete();
            $table->foreignId('from_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('to_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type'); // offer | answer | ice-candidate
            $table->json('payload');
            $table->boolean('is_consumed')->default(false);
            $table->timestamps();

            $table->index(['call_id', 'to_user_id', 'is_consumed']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('call_signals');
    }
};
