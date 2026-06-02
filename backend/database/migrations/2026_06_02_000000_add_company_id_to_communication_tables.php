<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table): void {
            $table->uuid('company_id')->nullable()->after('id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
        });

        Schema::table('notifications', function (Blueprint $table): void {
            $table->uuid('company_id')->nullable()->after('id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
        });

        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->uuid('company_id')->nullable()->after('id')->index();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->dropForeign(['company_id']);
            $table->dropColumn('company_id');
        });

        Schema::table('notifications', function (Blueprint $table): void {
            $table->dropForeign(['company_id']);
            $table->dropColumn('company_id');
        });

        Schema::table('announcements', function (Blueprint $table): void {
            $table->dropForeign(['company_id']);
            $table->dropColumn('company_id');
        });
    }
};
