<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('approval_steps')) {
            Schema::create('approval_steps', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('workflow_id')->index();
                $table->unsignedInteger('step_order')->default(1);
                $table->string('approver_type'); // role, user, dynamic (manager, department_head)
                $table->string('approver_identifier')->nullable(); // role name or user id or rule
                $table->json('conditions')->nullable();
                $table->timestamps();

                $table->foreign('workflow_id')->references('id')->on('workflows')->onDelete('cascade');
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('approval_steps');
    }
};
