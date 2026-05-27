<?php

namespace App\Services;

use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;

class UserManagementService
{
    public function __construct(private readonly PermissionService $permissionService)
    {
    }

    public function create(array $data, ?User $actor = null): User
    {
        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);
        $data['password'] = Hash::make($data['password']);
        $user = User::create($data);
        if (!empty($roleIds)) {
            $validRoleIds = $this->resolveAssignableRoleIds($roleIds, $actor);
            $user->rolesRelation()->sync($validRoleIds);
            $this->permissionService->flushUserPermissionCache($user);
        }
        return $user->fresh('rolesRelation.permissions');
    }

    public function update(User $user, array $data, ?User $actor = null): User
    {
        $roleIds = $data['role_ids'] ?? null;
        unset($data['role_ids']);
        if (isset($data['password']) && $data['password']) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);
        if (is_array($roleIds)) {
            $validRoleIds = $this->resolveAssignableRoleIds($roleIds, $actor);
            $user->rolesRelation()->sync($validRoleIds);
            $this->permissionService->flushUserPermissionCache($user);
        }

        return $user->fresh('rolesRelation.permissions');
    }

    private function resolveAssignableRoleIds(array $roleIds, ?User $actor): array
    {
        return Role::query()
            ->whereIn('id', $roleIds)
            ->where(function ($query) use ($actor) {
                $query->whereNull('company_id');
                if ($actor?->company_id) {
                    $query->orWhere('company_id', $actor->company_id);
                }
            })
            ->pluck('id')
            ->all();
    }
}
