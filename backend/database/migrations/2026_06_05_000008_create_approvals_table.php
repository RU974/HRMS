<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('approvals')) {
            Schema::create('approvals', function (Blueprint $table) {
                $table->id();
                $table->string('module');
                $table->unsignedBigInteger('module_id')->index();
                $table->unsignedBigInteger('workflow_id')->nullable()->index();
                $table->unsignedBigInteger('current_step_id')->nullable()->index();
                $table->string('status')->default('pending'); // pending, approved, rejected, escalated
                $table->unsignedBigInteger('requested_by')->nullable()->index();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->foreign('workflow_id')->references('id')->on('workflows')->onDelete('set null');
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('approvals');
    }
};
