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
                'settings:manage_settings', 'reports:view', 'reports:manage_settings',
                'performance:view', 'performance:edit', 'performance:manage_settings',
                'announcement:view', 'announcement:create', 'announcement:edit', 'announcement:delete',
                'notification:view', 'notification:create', 'notification:edit', 'notification:delete',
            ],
            'HR Manager' => [
                'dashboard:view',
                'employees:view', 'employees:create', 'employees:edit',
                'leaves:view', 'leaves:approve', 'leaves:manage_settings',
                'attendance:view', 'attendance:edit',
                'payroll:view',
                'recruitment:view', 'recruitment:create', 'recruitment:edit',
                'documents:view', 'documents:create', 'documents:edit', 'documents:delete',
                'approvals:view', 'approvals:approve', 'approvals:manage_settings',
                'reports:view', 'announcement:view', 'announcement:create', 'announcement:edit',
                'performance:view', 'performance:edit',
                'chat:view', 'chat:create',
            ],
            'HR Executive' => [
                'dashboard:view',
                'employees:view',
                'leaves:view', 'leaves:approve',
                'attendance:view',
                'recruitment:view',
                'documents:view', 'documents:create',
                'approvals:view', 'approvals:approve',
                'announcement:view',
                'performance:view',
            ],
            'Payroll Manager' => [
                'dashboard:view',
                'employees:view',
                'payroll:view', 'payroll:create', 'payroll:edit', 'payroll:approve', 'payroll:manage_settings',
                'attendance:view',
                'approvals:view', 'approvals:approve',
                'reports:view', 'reports:export',
                'performance:view',
            ],
            'Attendance Manager' => [
                'dashboard:view',
                'attendance:view', 'attendance:create', 'attendance:edit', 'attendance:manage_settings',
                'employees:view',
                'approvals:view',
                'reports:view',
            ],
            'Recruiter' => [
                'dashboard:view',
                'recruitment:view', 'recruitment:create', 'recruitment:edit', 'recruitment:delete', 'recruitment:manage_settings',
                'employees:view',
                'approvals:view',
                'chat:view', 'chat:create',
            ],
            'Department Manager' => [
                'dashboard:view',
                'employees:view',
                'leaves:view', 'leaves:approve',
                'attendance:view',
                'approvals:view', 'approvals:approve',
                'performance:view', 'performance:edit',
            ],
            'IT Support' => [
                'dashboard:view',
                'users:view', 'users:edit',
                'documents:view',
                'settings:manage_settings',
                'reports:view',
            ],
            'Employee' => [
                'dashboard:view',
                'leaves:view', 'leaves:create',
                'attendance:view',
                'documents:view',
                'announcement:view',
                'notification:view',
                'chat:view', 'chat:create',
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
    }
}
