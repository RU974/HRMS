<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $rolePermissions = [
            'Super Admin' => ['*.*'],
            'Company Admin' => [
                'dashboard:view',
                'users:view', 'users:create', 'users:edit', 'users:delete', 'users:assign',
                'employees:view', 'employees:create', 'employees:edit', 'employees:delete',
                'leaves:view', 'leaves:approve', 'leaves:manage_settings',
                'attendance:view', 'attendance:edit', 'attendance:manage_settings',
                'payroll:view', 'payroll:edit', 'payroll:manage_settings',
                'recruitment:view', 'recruitment:create', 'recruitment:edit', 'recruitment:delete',
                'approvals:view', 'approvals:approve', 'approvals:manage_settings',
                'settings:manage_settings', 'reports:view', 'reports:manage_settings', 'reports:export',
                'performance:view', 'performance:edit', 'performance:manage_settings',
                'announcement:view', 'announcement:create', 'announcement:edit', 'announcement:delete',
                'notification:view', 'notification:create', 'notification:edit', 'notification:delete',
                'inventory:view', 'inventory:create', 'inventory:edit', 'inventory:delete', 'inventory:manage_settings',
                'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:delete', 'tickets:assign', 'tickets:manage_settings',
                'biometric:view', 'biometric:sync', 'biometric:manage_mapping',
                'licenses:view', 'licenses:manage_settings',
                'chat:view', 'chat:create', 'chat:edit', 'chat:delete', 'chat:manage_settings',
            ],
            'HR Manager' => [
                'dashboard:view',
                'employees:view', 'employees:view_all', 'employees:create', 'employees:edit',
                'leaves:view', 'leaves:approve', 'leaves:manage_settings',
                'attendance:view', 'attendance:edit',
                'payroll:view',
                'recruitment:view', 'recruitment:create', 'recruitment:edit',
                'documents:view', 'documents:create', 'documents:edit', 'documents:delete',
                'approvals:view', 'approvals:approve', 'approvals:manage_settings',
                'reports:view', 'reports:export', 'announcement:view', 'announcement:create', 'announcement:edit',
                'performance:view', 'performance:edit',
                'chat:view', 'chat:create',
                'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:delete', 'tickets:assign',
            ],
            'HR Executive' => [
                'dashboard:view',
                'employees:view', 'employees:view_all',
                'leaves:view', 'leaves:approve',
                'attendance:view',
                'recruitment:view',
                'documents:view', 'documents:create',
                'approvals:view', 'approvals:approve',
                'announcement:view',
                'performance:view',
                'chat:view', 'chat:create',
                'tickets:view', 'tickets:create',
            ],
            'Payroll Manager' => [
                'dashboard:view',
                'employees:view', 'employees:view_all',
                'payroll:view', 'payroll:create', 'payroll:edit', 'payroll:approve', 'payroll:manage_settings',
                'attendance:view',
                'approvals:view', 'approvals:approve',
                'reports:view', 'reports:export',
                'performance:view',
                'announcement:view',
                'notification:view',
                'chat:view', 'chat:create',
            ],
            'Attendance Manager' => [
                'dashboard:view',
                'attendance:view', 'attendance:create', 'attendance:edit', 'attendance:manage_settings',
                'biometric:view', 'biometric:sync', 'biometric:manage_mapping',
                'employees:view', 'employees:view_all',
                'approvals:view',
                'reports:view',
                'announcement:view',
                'notification:view',
                'chat:view', 'chat:create',
            ],
            'Recruiter' => [
                'dashboard:view',
                'recruitment:view', 'recruitment:create', 'recruitment:edit', 'recruitment:delete', 'recruitment:manage_settings',
                'employees:view', 'employees:view_all',
                'leaves:view', 'leaves:create',
                'approvals:view',
                'chat:view', 'chat:create',
                'announcement:view',
                'notification:view',
            ],
            'Department Manager' => [
                'dashboard:view',
                'employees:view',
                'leaves:view', 'leaves:approve',
                'attendance:view',
                'approvals:view', 'approvals:approve',
                'performance:view', 'performance:edit',
                'announcement:view',
                'notification:view',
                'chat:view', 'chat:create',
                'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:assign',
            ],
            'IT Support' => [
                'dashboard:view',
                'users:view', 'users:edit',
                'documents:view',
                'settings:manage_settings',
                'reports:view',
                'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:assign',
                'biometric:view', 'biometric:sync', 'biometric:manage_mapping',
                'inventory:view', 'inventory:create', 'inventory:edit',
                'announcement:view',
                'notification:view',
                'chat:view', 'chat:create',
            ],
            'Employee' => [
                'dashboard:view',
                'leaves:view', 'leaves:create',
                'attendance:view',
                'documents:view',
                'announcement:view',
                'notification:view',
                'chat:view', 'chat:create',
                'tickets:view', 'tickets:create',
                'reports:view_own',
                'payroll:view_own',
                'performance:view',
                'approvals:view',
            ],
        ];

        foreach ($rolePermissions as $roleName => $permissionNames) {
            $role = Role::where('name', $roleName)->first();
            if (!$role) {
                continue;
            }

            $permissions = [];

            foreach ($permissionNames as $permName) {
                if ($permName === '*.*') {
                    // Super Admin gets all permissions
                    $permissions = Permission::pluck('id')->all();
                    break;
                }

                $permission = Permission::where('name', $permName)->first();
                if ($permission) {
                    $permissions[] = $permission->id;
                }
            }

            // ensure we only sync valid, positive integer ids
            $permissions = array_values(array_filter(array_map('intval', $permissions), function ($id) {
                return $id > 0;
            }));

            if (!empty($permissions)) {
                $role->permissions()->sync($permissions);
            }
        }

        // Role permissions are cached per-user for 30 minutes (see PermissionService);
        // without this, users who already made a request keep stale permissions until
        // the cache naturally expires, even though the DB was just updated.
        \Illuminate\Support\Facades\Cache::flush();
    }
}
