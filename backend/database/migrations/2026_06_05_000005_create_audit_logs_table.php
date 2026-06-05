<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (! Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('method')->nullable()->index();
                $table->string('user_role')->nullable();
                $table->string('action');
                $table->string('module')->nullable();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->ipAddress('ip_address')->nullable();
                $table->json('old_value')->nullable();
                $table->json('new_value')->nullable();
                $table->timestamps();
                $table->boolean('immutable')->default(true)->index();
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('audit_logs');
    }
};
