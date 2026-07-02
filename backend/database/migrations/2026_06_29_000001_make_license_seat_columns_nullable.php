<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            // null means unlimited (Enterprise). The original migration used a
            // hard integer default which prevented storing null for seat limits.
            $table->unsignedInteger('max_employees')->nullable()->default(null)->change();
            $table->unsignedInteger('max_users')->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->unsignedInteger('max_employees')->nullable(false)->default(25)->change();
            $table->unsignedInteger('max_users')->nullable(false)->default(5)->change();
        });
    }
};
