<?php

use App\Models\ChatConversation;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('chat.{conversationId}', function ($user, $conversationId) {
    return ChatConversation::where('id', $conversationId)
        ->whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
        ->exists();
});

// Private per-user channel for real-time call events and WebRTC signals.
Broadcast::channel('call.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});

// Private per-user channel for chat inbox pings (unread badges, list refresh,
// desktop notifications) and conversation membership changes.
Broadcast::channel('chat.user.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});
