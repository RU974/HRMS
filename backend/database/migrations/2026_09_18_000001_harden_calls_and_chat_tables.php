<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calls', function (Blueprint $table): void {
            // Current host. Starts as the initiator and moves to another joined
            // participant if the host leaves a group call.
            $table->foreignId('host_id')->nullable()->after('initiated_by')->constrained('users')->nullOnDelete();
            $table->index(['status', 'created_at']);
        });

        Schema::table('call_participants', function (Blueprint $table): void {
            $table->timestamp('last_heartbeat_at')->nullable()->after('left_at');
            $table->index(['status', 'last_heartbeat_at']);
        });

        Schema::table('call_signals', function (Blueprint $table): void {
            $table->index('created_at');
        });

        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->timestamp('edited_at')->nullable()->after('attachment_size');
            $table->softDeletes();
            $table->index(['conversation_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->dropIndex(['conversation_id', 'id']);
            $table->dropSoftDeletes();
            $table->dropColumn('edited_at');
        });

        Schema::table('call_signals', function (Blueprint $table): void {
            $table->dropIndex(['created_at']);
        });

        Schema::table('call_participants', function (Blueprint $table): void {
            $table->dropIndex(['status', 'last_heartbeat_at']);
            $table->dropColumn('last_heartbeat_at');
        });

        Schema::table('calls', function (Blueprint $table): void {
            $table->dropIndex(['status', 'created_at']);
            $table->dropConstrainedForeignId('host_id');
        });
    }
};
