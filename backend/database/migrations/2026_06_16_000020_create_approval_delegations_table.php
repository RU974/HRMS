<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_delegations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('delegator_user_id')->index();
            $table->unsignedBigInteger('delegate_user_id')->index();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('delegator_user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('delegate_user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_delegations');
    }
};
