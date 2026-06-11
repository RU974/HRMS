<?php

namespace App\Http\Controllers;

use App\Models\Permission;
use App\Models\Role;
use App\Services\PermissionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RolePermissionController extends Controller
{
    public function __construct(private readonly PermissionService $permissionService)
    {
    }

    public function permissions(Request $request)
    {
        $this->authorizePermission($request, 'users:manage_settings');
        $grouped = Permission::query()
            ->orderBy('module')
            ->orderBy('action')
            ->get()
            ->groupBy('module')
            ->map(fn ($items, $module) => [
                'module' => $module,
                'permissions' => $items->values(),
            ])
            ->values();

        return $this->ok($grouped);
    }

    public function roles(Request $request)
    {
        $this->authorizePermission($request, 'users:manage_settings');
        $companyId = $request->user()?->company_id;

        $roles = Role::with('permissions')
            ->where(function ($query) use ($companyId) {
                $query->whereNull('company_id');
                if ($companyId) {
                    $query->orWhere('company_id', $companyId);
                }
            })
            ->orderByDesc('is_system')
            ->orderBy('name')
            ->get();

        return $this->ok($roles);
    }

    public function storeRole(Request $request)
    {
        $this->authorizePermission($request, 'users:manage_settings');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'permission_ids' => 'required|array|min:1',
            'permission_ids.*' => 'required|exists:permissions,id',
        ]);

        $companyId = $request->user()?->company_id;

        $role = DB::transaction(function () use ($validated, $companyId) {
            $role = Role::create([
                'company_id' => $companyId,
                'name' => $validated['name'],
                'guard_name' => 'web',
                'description' => $validated['description'] ?? null,
                'is_system' => false,
            ]);

            $role->permissions()->sync($validated['permission_ids']);

            return $role->load('permissions');
        });

        return $this->ok($role, 'Role created successfully', 201);
    }

    public function updateRole(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:manage_settings');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'permission_ids' => 'required|array|min:1',
            'permission_ids.*' => 'required|exists:permissions,id',
        ]);

        $role = Role::findOrFail($id);
        $companyId = $request->user()?->company_id;
        if ($role->company_id !== null && $role->company_id !== $companyId) {
            return $this->fail('You are not allowed to modify this role.', 403);
        }
        if ($role->is_system) {
            return $this->fail('System roles cannot be edited.', 422);
        }

        // Collect affected users BEFORE the transaction so the list is accurate
        $affectedUsers = $role->users()->get();

        DB::transaction(function () use ($role, $validated) {
            $role->update([
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
            ]);
            $role->permissions()->sync($validated['permission_ids']);
        });

        // Flush cache for every user that has this role, using a fresh query
        $affectedUsers->each(fn ($user) => $this->permissionService->flushUserPermissionCache($user));

        return $this->ok($role->fresh('permissions'), 'Role updated successfully');
    }

    public function deleteRole(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:manage_settings');
        $role = Role::with('users')->withCount('users')->findOrFail($id);
        $companyId = $request->user()?->company_id;
        if ($role->company_id !== null && $role->company_id !== $companyId) {
            return $this->fail('You are not allowed to delete this role.', 403);
        }
        if ($role->is_system) {
            return $this->fail('System roles cannot be deleted.', 422);
        }

        if ($role->users_count > 0 && !$request->boolean('force')) {
            return $this->fail('Role is assigned to users. Pass force=true after confirmation.', 409);
        }

        $affectedUsers = $role->users;
        $role->delete();
        $affectedUsers->each(fn ($user) => $this->permissionService->flushUserPermissionCache($user));

        return $this->ok(null, 'Role deleted successfully');
    }

    public function myPermissions(Request $request)
    {
        $permissions = $this->permissionService
            ->getMergedPermissions($request->user())
            ->values();

        return $this->ok([
            'permissions' => $permissions,
            'roles' => $request->user()?->loadMissing('roles.permissions')->roles,
        ]);
    }
}
