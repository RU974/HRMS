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

    private function syncAssignableRoles(User $user, array $roleIds, ?User $actor): void
    {
        // Cast every incoming value to int — handles strings like "1", "2" from JSON
        $requestedRoleIds = collect($roleIds)
            ->filter(fn ($id) => filled($id) && is_numeric($id))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        if (empty($requestedRoleIds)) {
            return;
        }

        $validRoleIds = $this->resolveAssignableRoleIds($requestedRoleIds, $actor);

        if (empty($validRoleIds)) {
            abort(422, 'None of the selected roles could be assigned.');
        }

        $user->syncRoles($validRoleIds);
        $this->permissionService->flushUserPermissionCache($user);
    }

    private function resolveAssignableRoleIds(array $roleIds, ?User $actor): array
    {
        if (!$actor || (!$actor->can('settings:manage_settings') && !$actor->can('users:edit'))) {
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
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}