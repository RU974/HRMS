<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            if (!Schema::hasColumn('announcements', 'category')) {
                $table->string('category')->nullable()->after('target');
            }
            if (!Schema::hasColumn('announcements', 'tags')) {
                $table->json('tags')->nullable()->after('category');
            }
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table) {
            $table->dropColumn(['category', 'tags']);
        });
    }
};
