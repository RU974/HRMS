<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class PermissionService
{
    public const WILDCARD = '*.*';

    public function getMergedPermissions(User $user): Collection
    {
        if ($this->isSuperAdmin($user)) {
            return collect([self::WILDCARD, '*']);
        }

        $cacheKey = $this->cacheKey($user->id);

        return Cache::remember($cacheKey, now()->addMinutes(30), function () use ($user) {
            $loaded = $user->loadMissing(['roles.permissions', 'permissions']);

            return $loaded->roles
                ->flatMap(function ($role) {
                    return $role->permissions->flatMap(function ($permission) {
                        return [
                            mb_strtolower($permission->name),
                            mb_strtolower($permission->module . '.' . $permission->action),
                            mb_strtolower($permission->module . ':' . $permission->action),
                        ];
                    });
                })
                ->merge($loaded->permissions->flatMap(function ($permission) {
                    return [
                        mb_strtolower($permission->name),
                        mb_strtolower($permission->module . '.' . $permission->action),
                        mb_strtolower($permission->module . ':' . $permission->action),
                    ];
                }))
                ->unique()
                ->values();
        });
    }

    public function hasPermission(User $user, string $requiredPermission): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        $permissions = $this->getMergedPermissions($user);
        $normalized = mb_strtolower(trim($requiredPermission));
        $normalizedKey = str_replace(':', '.', $normalized);

        return $permissions->contains(self::WILDCARD)
            || $permissions->contains('*')
            || $permissions->contains($normalized)
            || $permissions->contains($normalizedKey);
    }

    private function isSuperAdmin(User $user): bool
    {
        return $user->hasAnyRole([User::ROLE_SUPER_ADMIN]);
    }

    public function flushUserPermissionCache(User $user): void
    {
        Cache::forget($this->cacheKey($user->id));
    }

    private function cacheKey(int $userId): string
    {
        return 'rbac:user_permissions:' . $userId;
    }
}
