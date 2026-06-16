<?php

namespace App\Policies;

use App\Models\ChatMessage;
use App\Models\User;

class ChatMessagePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, ChatMessage $message): bool
    {
        return $this->canView($user) && $this->sameCompany($user, $message)
            || $this->isParticipant($user, $message);
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, ChatMessage $message): bool
    {
        return $this->canManage($user) && $this->sameCompany($user, $message)
            || $this->isSender($user, $message);
    }

    public function delete(User $user, ChatMessage $message): bool
    {
        return ($this->canManage($user) && $this->sameCompany($user, $message))
            || $this->isSender($user, $message);
    }

    private function canView(User $user): bool
    {
        return $user->can('chat:manage_settings') || $user->can('chat:view');
    }

    private function canManage(User $user): bool
    {
        return $user->can('chat:manage_settings');
    }

    private function isParticipant(User $user, ChatMessage $message): bool
    {
        if ($this->isSender($user, $message) || $this->isReceiver($user, $message)) {
            return true;
        }

        if (!$message->conversation_id) {
            return false;
        }

        return $message->conversation()->whereHas('participants', function ($query) use ($user): void {
            $query->where('user_id', $user->id);
        })->exists();
    }

    private function isSender(User $user, ChatMessage $message): bool
    {
        return (int) $message->sender_id === (int) $user->id;
    }

    private function isReceiver(User $user, ChatMessage $message): bool
    {
        return (int) $message->receiver_id === (int) $user->id;
    }

    private function sameCompany(User $user, ChatMessage $message): bool
    {
        if (!$user->company_id) {
            return false;
        }

        if ($message->company_id) {
            return (string) $message->company_id === (string) $user->company_id;
        }

        return (string) ($message->sender?->company_id ?? $message->receiver?->company_id ?? '') === (string) $user->company_id;
    }
}
