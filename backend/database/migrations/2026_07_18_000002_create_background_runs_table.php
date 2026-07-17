<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('background_runs', function (Blueprint $table) {
            $table->id();
            $table->string('type');
            $table->string('status')->default('queued');
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->json('summary')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('background_runs');
    }
};
