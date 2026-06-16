<?php

namespace App\Policies;

use App\Models\ChatConversation;
use App\Models\User;

class ChatConversationPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, ChatConversation $conversation): bool
    {
        return $this->canManage($user) || $this->isParticipant($user, $conversation);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, ChatConversation $conversation): bool
    {
        return $this->canManage($user) || $this->isParticipant($user, $conversation);
    }

    private function canManage(User $user): bool
    {
        return $user->can('chat:manage_settings');
    }

    private function isParticipant(User $user, ChatConversation $conversation): bool
    {
        return $conversation->participants()->where('user_id', $user->id)->exists();
    }
}
