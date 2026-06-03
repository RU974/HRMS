<?php

namespace App\Policies;

use App\Models\Announcement;
use App\Models\User;

class AnnouncementPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Announcement $announcement): bool
    {
        if ($this->canManage($user)) {
            return $this->sameCompany($user, $announcement);
        }

        return $announcement->is_published
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

    private function canManage(User $user): bool
    {
        return $user->hasRole(User::ROLE_SUPER_ADMIN);
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
            || ($announcement->target === 'employees' && $user->hasRole(User::ROLE_EMPLOYEE))
            || ($announcement->target === 'hr' && $user->hasAnyRole([User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE, User::ROLE_COMPANY_ADMIN, User::ROLE_SUPER_ADMIN]))
            || ($announcement->target === 'managers' && $user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER, User::ROLE_HR_MANAGER, User::ROLE_COMPANY_ADMIN, User::ROLE_SUPER_ADMIN]));
    }
}
