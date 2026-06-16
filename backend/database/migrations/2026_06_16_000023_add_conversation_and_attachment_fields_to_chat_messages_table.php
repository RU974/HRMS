<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->unsignedBigInteger('conversation_id')->nullable()->after('id');
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->string('attachment_mime')->nullable();
            $table->unsignedBigInteger('attachment_size')->nullable();

            $table->foreign('conversation_id')->references('id')->on('chat_conversations')->nullOnDelete();
        });

        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->unsignedBigInteger('receiver_id')->nullable()->change();
            $table->text('message')->nullable()->change();
        });

        $this->backfillConversations();
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table): void {
            $table->dropForeign(['conversation_id']);
            $table->dropColumn(['conversation_id', 'attachment_path', 'attachment_name', 'attachment_mime', 'attachment_size']);
        });
    }

    private function backfillConversations(): void
    {
        $pairs = DB::table('chat_messages')
            ->select('sender_id', 'receiver_id')
            ->distinct()
            ->get();

        $seen = [];

        foreach ($pairs as $pair) {
            $key = implode('-', [min($pair->sender_id, $pair->receiver_id), max($pair->sender_id, $pair->receiver_id)]);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $conversationId = DB::table('chat_conversations')->insertGetId([
                'type' => 'direct',
                'created_by' => $pair->sender_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ([$pair->sender_id, $pair->receiver_id] as $userId) {
                DB::table('chat_conversation_participants')->insert([
                    'conversation_id' => $conversationId,
                    'user_id' => $userId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('chat_messages')
                ->where(function ($query) use ($pair): void {
                    $query->where('sender_id', $pair->sender_id)->where('receiver_id', $pair->receiver_id);
                })
                ->orWhere(function ($query) use ($pair): void {
                    $query->where('sender_id', $pair->receiver_id)->where('receiver_id', $pair->sender_id);
                })
                ->update(['conversation_id' => $conversationId]);
        }
    }
};
