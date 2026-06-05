<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('workflows')) {
            Schema::create('workflows', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('module');
                $table->text('definition')->nullable(); // JSON definition of steps/conditions
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->timestamps();
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('workflows');
    }
};
