<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('role_user')) {
            Schema::create('role_user', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedBigInteger('role_id')->index();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();

                $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
                $table->unique(['user_id', 'role_id', 'company_id'], 'user_role_unique');
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('role_user');
    }
};
