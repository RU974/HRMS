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
        $this->syncAssignableRoles($user, $roleIds, $actor);

        return $user->fresh(['company', 'branch', 'roles.permissions', 'permissions']);
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
            $this->syncAssignableRoles($user, $roleIds, $actor);
        }

        return $user->fresh(['company', 'branch', 'roles.permissions', 'permissions']);
    }

    /**
     * @param  array<int, string>  $roleIds
     */
    private function syncAssignableRoles(User $user, array $roleIds, ?User $actor): void
    {
        $requestedRoleIds = collect($roleIds)
            ->filter(fn ($roleId) => filled($roleId))
            ->map(fn ($roleId) => trim((string) $roleId))
            ->unique()
            ->values()
            ->all();

        if (empty($requestedRoleIds)) {
            return;
        }

        $validRoleIds = $this->resolveAssignableRoleIds($requestedRoleIds, $actor);

        if (count($validRoleIds) !== count($requestedRoleIds)) {
            abort(422, 'One or more selected roles could not be assigned.');
        }

        $user->syncRoles($validRoleIds);
        $this->permissionService->flushUserPermissionCache($user);
    }

    private function resolveAssignableRoleIds(array $roleIds, ?User $actor): array
    {
        if (!$actor || !$actor->can('assign roles')) {
            abort(403, 'You are not authorized to assign roles.');
        }

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
