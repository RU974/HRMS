<?php

namespace App\Models\Concerns;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

trait HasRoles
{
    public function roles(): MorphToMany
    {
        return $this->morphToMany(Role::class, 'model', 'model_has_roles', 'model_id', 'role_id')
            ->withTimestamps();
    }

    public function rolesRelation(): MorphToMany
    {
        return $this->roles();
    }

    public function permissions(): MorphToMany
    {
        return $this->morphToMany(Permission::class, 'model', 'model_has_permissions', 'model_id', 'permission_id')
            ->withTimestamps();
    }

    public function permissionsRelation(): MorphToMany
    {
        return $this->permissions();
    }

    public function hasRole(string|array|Role $roles): bool
    {
        $roleNames = $this->getRoleNames();
        // Super Admin bypass: has every role implicitly
        if ($roleNames->contains(User::ROLE_SUPER_ADMIN)) {
            return true;
        }
        $requested = collect(is_array($roles) ? $roles : [$roles])
            ->map(fn ($role) => $role instanceof Role ? $role->name : trim((string) $role))
            ->filter()
            ->values();

        return $requested->isNotEmpty() && $requested->intersect($roleNames)->isNotEmpty();
    }

    public function hasAnyRole(array|string $roles): bool
    {
        return $this->hasRole($roles);
    }

    public function assignRole(string|Role|array $roles): static
    {
        $ids = $this->resolveRoleIds($roles);

        if (!empty($ids)) {
            $this->roles()->syncWithoutDetaching($ids);
        }

        return $this->loadMissing('roles.permissions', 'permissions');
    }

    public function removeRole(string|Role|array $roles): static
    {
        $ids = $this->resolveRoleIds($roles);

        if (!empty($ids)) {
            $this->roles()->detach($ids);
        }

        return $this->loadMissing('roles.permissions', 'permissions');
    }

    public function syncRoles(string|Role|array $roles): static
    {
        $ids = $this->resolveRoleIds($roles);
        $this->roles()->sync($ids);

        return $this->loadMissing('roles.permissions', 'permissions');
    }

    public function givePermissionTo(string|Permission|array $permissions): static
    {
        $ids = $this->resolvePermissionIds($permissions);

        if (!empty($ids)) {
            $this->permissions()->syncWithoutDetaching($ids);
        }

        return $this->loadMissing('roles.permissions', 'permissions');
    }

    public function revokePermissionTo(string|Permission|array $permissions): static
    {
        $ids = $this->resolvePermissionIds($permissions);

        if (!empty($ids)) {
            $this->permissions()->detach($ids);
        }

        return $this->loadMissing('roles.permissions', 'permissions');
    }

    public function syncPermissions(string|Permission|array $permissions): static
    {
        $ids = $this->resolvePermissionIds($permissions);
        $this->permissions()->sync($ids);

        return $this->loadMissing('roles.permissions', 'permissions');
    }

    public function getRoleNames(): Collection
    {
        return $this->roles()->pluck('name')->values();
    }

    public function getAllPermissions(): Collection
    {
        $this->loadMissing(['roles.permissions', 'permissions']);

        return $this->roles
            ->flatMap(fn (Role $role) => $role->permissions)
            ->merge($this->permissions)
            ->unique(fn (Permission $permission) => $permission->getKey())
            ->values();
    }

    public function can($abilities, $arguments = []): bool
    {
        if (is_array($abilities)) {
            foreach ($abilities as $ability) {
                if ($this->can($ability, $arguments)) {
                    return true;
                }
            }

            return false;
        }

        if ($this->hasPermissionName((string) $abilities)) {
            return true;
        }

        return Gate::forUser($this)->check($abilities, $arguments);
    }

    public function hasPermissionName(string $permission): bool
    {
        return app(PermissionService::class)->hasPermission($this, $permission);
    }

    public function hasPermission(string $permissionKey): bool
    {
        return $this->hasPermissionName($permissionKey);
    }

    public function hasAnyPermission(array $permissionKeys): bool
    {
        foreach ($permissionKeys as $permissionKey) {
            if ($this->hasPermissionName($permissionKey)) {
                return true;
            }
        }

        return false;
    }

    private function resolveRoleIds(string|Role|array $roles): array
    {
        $roles = is_array($roles) ? $roles : [$roles];

        return collect($roles)
            ->map(function ($role) {
                if ($role instanceof Role) {
                    return $role->getKey();
                }

                if (is_numeric($role)) {
                    return $role;
                }

                $roleKey = trim((string) $role);
            $byId = Role::query()
                ->whereKey($roleKey)
                ->value('id');

            if ($byId) {
                return $byId;
            }

            return Role::query()
                ->where('name', $roleKey)
                ->where('guard_name', $this->getDefaultGuardName())
                ->value('id');
            })
            ->filter()
            ->values()
            ->all();
    }

    private function resolvePermissionIds(string|Permission|array $permissions): array
    {
        $permissions = is_array($permissions) ? $permissions : [$permissions];

        return collect($permissions)
            ->map(function ($permission) {
                if ($permission instanceof Permission) {
                    return $permission->getKey();
                }

                if (is_numeric($permission)) {
                    return $permission;
                }

                $byId = Permission::query()->whereKey((string) $permission)->value('id');
                if ($byId) {
                    return $byId;
                }

                $normalized = $this->normalizePermissionName((string) $permission);
                $key = $this->normalizePermissionKey((string) $permission);

                $query = Permission::query()->whereRaw('LOWER(name) = ?', [$normalized]);

                if (str_contains($key, '.')) {
                    [$module, $action] = explode('.', $key, 2);
                    $query->orWhere(function ($permissionQuery) use ($module, $action): void {
                        $permissionQuery->whereRaw('LOWER(module) = ?', [$module])
                            ->whereRaw('LOWER(action) = ?', [$action]);
                    });
                }

                return $query->value('id');
            })
            ->filter()
            ->values()
            ->all();
    }

    private function normalizePermissionName(string $permission): string
    {
        return trim(mb_strtolower($permission));
    }

    private function normalizePermissionKey(string $permission): string
    {
        return str_replace(':', '.', trim(mb_strtolower($permission)));
    }

    private function getDefaultGuardName(): string
    {
        return property_exists($this, 'guard_name') && is_string($this->guard_name) && $this->guard_name !== ''
            ? $this->guard_name
            : config('auth.defaults.guard', 'web');
    }
}
