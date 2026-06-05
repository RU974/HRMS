<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('permissions')) {
            Schema::create('permissions', function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->string('module')->nullable()->index();
                $table->string('action')->nullable()->index();
                $table->string('guard_name')->default('web');
                $table->string('display_name')->nullable();
                $table->text('description')->nullable();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('permissions');
    }
};
