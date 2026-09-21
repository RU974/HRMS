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
        return $this->canManage($user, $conversation) || $this->isParticipant($user, $conversation);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, ChatConversation $conversation): bool
    {
        return $this->manage($user, $conversation);
    }

    /**
     * Rename a group and add/remove its members. Limited to the person who
     * created the group and company chat administrators. Legacy groups with no
     * recorded creator stay manageable by any member so they are not orphaned.
     */
    public function manage(User $user, ChatConversation $conversation): bool
    {
        if ($this->canManage($user, $conversation)) {
            return true;
        }

        if ($conversation->created_by !== null) {
            return (int) $conversation->created_by === (int) $user->id
                && $this->isParticipant($user, $conversation);
        }

        return $this->isParticipant($user, $conversation);
    }

    private function canManage(User $user, ChatConversation $conversation): bool
    {
        return $user->can('chat:manage_settings')
            && $conversation->company_id === $user->company_id;
    }

    private function isParticipant(User $user, ChatConversation $conversation): bool
    {
        return $conversation->participants()->where('user_id', $user->id)->exists();
    }
}
