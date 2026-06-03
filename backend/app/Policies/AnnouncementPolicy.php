<?php

namespace App\Policies;

use App\Models\Announcement;
use App\Models\User;

class AnnouncementPolicy
{
    public function viewAny(User $user): bool
    {
        return $this->canView($user);
    }

    public function view(User $user, Announcement $announcement): bool
    {
        if ($this->canManage($user)) {
            return $this->sameCompany($user, $announcement);
        }

        return $this->canView($user)
            && $announcement->is_published
            && $this->sameCompany($user, $announcement)
            && $this->isTargetVisibleToUser($user, $announcement);
    }

    public function create(User $user): bool
    {
        return $this->canManage($user);
    }

    public function update(User $user, Announcement $announcement): bool
    {
        return $this->canManage($user) && $this->sameCompany($user, $announcement);
    }

    public function delete(User $user, Announcement $announcement): bool
    {
        return $this->canManage($user) && $this->sameCompany($user, $announcement);
    }

    private function canView(User $user): bool
    {
        return $user->can('view announcements') || $user->can('manage announcements');
    }

    private function canManage(User $user): bool
    {
        return $user->can('manage announcements');
    }

    private function sameCompany(User $user, Announcement $announcement): bool
    {
        if (!$user->company_id) {
            return false;
        }

        if ($announcement->company_id) {
            return (string) $announcement->company_id === (string) $user->company_id;
        }

        return (string) ($announcement->creator?->company_id ?? '') === (string) $user->company_id;
    }

    private function isTargetVisibleToUser(User $user, Announcement $announcement): bool
    {
        return $announcement->target === 'all'
            || ($announcement->target === 'employees' && $user->can('view employee announcements'))
            || ($announcement->target === 'hr' && $user->can('view hr announcements'))
            || ($announcement->target === 'managers' && $user->can('view manager announcements'));
    }
}
