<?php

namespace App\Policies;

use App\Models\NotificationItem;
use App\Models\User;

class NotificationPolicy
{
    public function viewAny(User $user): bool
    {
        return $this->canView($user);
    }

    public function view(User $user, NotificationItem $notification): bool
    {
        return $this->canView($user) && $this->sameCompany($user, $notification)
            || $this->isOwnedByUser($user, $notification);
    }

    public function create(User $user): bool
    {
        return $this->canView($user);
    }

    public function update(User $user, NotificationItem $notification): bool
    {
        return $this->canManage($user)
            || $this->isOwnedByUser($user, $notification);
    }

    public function delete(User $user, NotificationItem $notification): bool
    {
        return $this->canManage($user)
            || $this->isOwnedByUser($user, $notification);
    }

    private function canView(User $user): bool
    {
        return $user->can('view notifications') || $user->can('manage notifications');
    }

    private function canManage(User $user): bool
    {
        return $user->can('manage notifications');
    }

    private function isOwnedByUser(User $user, NotificationItem $notification): bool
    {
        return (int) $notification->user_id === (int) $user->id
            || ($notification->user_id === null && (int) ($notification->creator?->company_id ?? 0) === (int) ($user->company_id ?? 0));
    }

    private function sameCompany(User $user, NotificationItem $notification): bool
    {
        if (!$user->company_id) {
            return false;
        }

        if ($notification->company_id) {
            return (string) $notification->company_id === (string) $user->company_id;
        }

        return (string) ($notification->creator?->company_id ?? '') === (string) $user->company_id;
    }
}
