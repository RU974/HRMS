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
        $this->authorizePermission($request, 'settings:manage_settings');
        $user = User::with('roles.permissions', 'permissions')->findOrFail($id);
        $this->assertSameCompanyUser($request, $user);

        return $this->ok([
            'roles' => $user->roles,
            'permissions' => $user->getAllPermissions()->values(),
        ]);
    }

    public function assignRole(SingleUserRoleRequest $request, int $id)
    {
        $validated = $request->validated();

        $this->authorizePermission($request, 'settings:manage_settings');

        $user = User::findOrFail($id);
        $this->assertSameCompanyUser($request, $user);
        $role = Role::findOrFail($validated['role_id']);
        $this->assertAssignableRole($request, $role);

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

        $this->authorizePermission($request, 'settings:manage_settings');

        $user = User::findOrFail($id);
        $this->assertSameCompanyUser($request, $user);
        $role = Role::findOrFail($validated['role_id']);
        $this->assertAssignableRole($request, $role);

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

        $this->authorizePermission($request, 'settings:manage_settings');

        $user = User::findOrFail($id);
        $this->assertSameCompanyUser($request, $user);
        $roles = Role::query()->whereIn('id', $validated['roles'])->get();
        $roles->each(fn (Role $role) => $this->assertAssignableRole($request, $role));

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

    private function assertSameCompanyUser(Request $request, User $targetUser): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if ((string) ($targetUser->company_id ?? '') !== (string) $companyId) {
            abort(403, 'You are not authorized to access this user.');
        }
    }

    private function assertAssignableRole(Request $request, Role $role): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId || $role->company_id === null) {
            return;
        }

        if ((string) $role->company_id !== (string) $companyId) {
            abort(403, 'You are not allowed to assign this role.');
        }
    }
}