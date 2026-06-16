<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_responses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('approval_id')->index();
            $table->unsignedBigInteger('approval_step_id')->index();
            $table->unsignedBigInteger('approver_user_id')->index();
            $table->string('decision'); // approve, reject
            $table->text('notes')->nullable();
            $table->timestamp('responded_at');
            $table->timestamps();

            $table->foreign('approval_id')->references('id')->on('approvals')->cascadeOnDelete();
            $table->foreign('approval_step_id')->references('id')->on('approval_steps')->cascadeOnDelete();
            $table->unique(['approval_id', 'approval_step_id', 'approver_user_id'], 'approval_responses_unique_response');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_responses');
    }
};
