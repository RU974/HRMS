<?php

namespace App\Http\Controllers;

use App\Http\Requests\Rbac\SingleUserRoleRequest;
use App\Http\Requests\Rbac\SyncUserRolesRequest;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserRoleController extends Controller
{
    public function __construct(
        private readonly PermissionService $permissionService,
        private readonly AuditLogService $auditLogService
    )
    {
    }

    public function getUserRoles(Request $request, int $id)
    {
        $this->authorizePermission($request, 'assign roles');
        $user = User::with('roles.permissions', 'permissions')->findOrFail($id);

        return $this->ok([
            'roles' => $user->roles,
            'permissions' => $user->getAllPermissions()->values(),
        ]);
    }

    public function assignRole(SingleUserRoleRequest $request, int $id)
    {
        $validated = $request->validated();

        $this->authorizePermission($request, 'assign roles');

        $user = User::findOrFail($id);
        $role = Role::findOrFail($validated['role_id']);

        DB::transaction(function () use ($user, $role): void {
            $user->assignRole($role);
        });

        $this->permissionService->flushUserPermissionCache($user);
        $this->auditLogService->recordRequest(
            $request,
            'assign_role',
            'rbac',
            'Assigned role to user',
            null,
            ['user_id' => $user->id, 'role_id' => $role->id, 'role_name' => $role->name]
        );

        return $this->ok($user->fresh(['roles.permissions', 'permissions']), 'Role assigned successfully');
    }

    public function removeRole(SingleUserRoleRequest $request, int $id)
    {
        $validated = $request->validated();

        $this->authorizePermission($request, 'assign roles');

        $user = User::findOrFail($id);
        $role = Role::findOrFail($validated['role_id']);

        DB::transaction(function () use ($user, $role): void {
            $user->removeRole($role);
        });

        $this->permissionService->flushUserPermissionCache($user);
        $this->auditLogService->recordRequest(
            $request,
            'remove_role',
            'rbac',
            'Removed role from user',
            null,
            ['user_id' => $user->id, 'role_id' => $role->id, 'role_name' => $role->name]
        );

        return $this->ok($user->fresh(['roles.permissions', 'permissions']), 'Role removed successfully');
    }

    public function updateUserRoles(Request $request, int $id)
    {
        return $this->syncRoles($request, $id);
    }

    public function syncRoles(SyncUserRolesRequest $request, int $id)
    {
        $validated = $request->validated();

        $this->authorizePermission($request, 'assign roles');

        $user = User::findOrFail($id);
        $roles = Role::query()->whereIn('id', $validated['roles'])->get();

        DB::transaction(function () use ($user, $roles): void {
            $user->syncRoles($roles->all());
        });

        $this->permissionService->flushUserPermissionCache($user);
        $this->auditLogService->recordRequest(
            $request,
            'sync_roles',
            'rbac',
            'Synchronized user roles',
            null,
            ['user_id' => $user->id, 'roles' => $roles->pluck('name')->values()->all()]
        );

        return $this->ok($user->fresh(['roles.permissions', 'permissions']), 'User roles updated successfully');
    }
}
