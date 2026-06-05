<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('permission_role')) {
            Schema::create('permission_role', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('role_id')->index();
                $table->unsignedBigInteger('permission_id')->index();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();

                $table->foreign('role_id')->references('id')->on('roles')->onDelete('cascade');
                $table->foreign('permission_id')->references('id')->on('permissions')->onDelete('cascade');
                $table->unique(['role_id', 'permission_id', 'company_id'], 'role_permission_unique');
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('permission_role');
    }
};
