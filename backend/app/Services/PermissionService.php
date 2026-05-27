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
        $cacheKey = $this->cacheKey($user->id);

        return Cache::remember($cacheKey, now()->addMinutes(30), function () use ($user) {
            $loaded = $user->loadMissing('rolesRelation.permissions');

            return $loaded->rolesRelation
                ->flatMap(fn ($role) => $role->permissions->map(fn ($permission) => $permission->module . '.' . $permission->action))
                ->unique()
                ->values();
        });
    }

    public function hasPermission(User $user, string $requiredPermission): bool
    {
        $permissions = $this->getMergedPermissions($user);
        $normalized = str_replace(':', '.', $requiredPermission);

        return $permissions->contains(self::WILDCARD) || $permissions->contains($normalized);
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
