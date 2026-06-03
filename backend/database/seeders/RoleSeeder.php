<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $all = Permission::all()->keyBy(function (Permission $permission): string {
            return mb_strtolower($permission->name ?: $permission->module . '.' . $permission->action);
        });
        $allPermissionKeys = $all->keys()->all();

        $roles = [
            'Super Admin' => $allPermissionKeys,
            'Company Admin' => ['view dashboard', 'view users', 'create users', 'edit users', 'delete users', 'assign roles', 'view employees', 'create employees', 'edit employees', 'delete employees', 'manage employees', 'view attendance', 'manage attendance', 'approve attendance', 'view leaves', 'approve leaves', 'view payroll', 'process payroll', 'manage payroll', 'view recruitment', 'manage recruitment', 'edit recruitment', 'schedule interviews', 'send offers', 'view performance', 'manage performance', 'edit performance', 'view reports', 'export reports', 'manage reports', 'view announcements', 'manage announcements', 'view notifications', 'manage notifications', 'view hr announcements', 'view manager announcements', 'view team employees', 'manage settings', 'view audit logs', 'manage roles', 'manage permissions', 'view system settings'],
            'HR Manager' => ['view dashboard', 'view employees', 'create employees', 'edit employees', 'delete employees', 'manage employees', 'export employees', 'manage employee documents', 'view attendance', 'manage attendance', 'approve attendance', 'manage leaves', 'approve leaves', 'view leaves', 'view performance', 'manage performance', 'edit performance', 'view reports', 'export reports', 'manage reports', 'view announcements', 'view notifications', 'view hr announcements', 'view manager announcements', 'view team employees'],
            'HR Executive' => ['view dashboard', 'view employees', 'create employees', 'edit employees', 'manage employees', 'view attendance', 'manage attendance', 'manage leaves', 'view leaves', 'view reports', 'view announcements', 'view notifications', 'view hr announcements'],
            'Payroll Manager' => ['view dashboard', 'view payroll', 'process payroll', 'manage payroll', 'view reports', 'export reports', 'manage reports', 'view announcements', 'view notifications'],
            'Attendance Manager' => ['view dashboard', 'view attendance', 'manage attendance', 'approve attendance', 'view reports', 'view announcements', 'view notifications'],
            'Recruiter' => ['view dashboard', 'view recruitment', 'manage recruitment', 'edit recruitment', 'schedule interviews', 'send offers', 'view reports', 'view announcements', 'view notifications'],
            'Department Manager' => ['view dashboard', 'view employees', 'view attendance', 'view leaves', 'approve leaves', 'view performance', 'edit performance', 'view reports', 'view announcements', 'view notifications', 'view manager announcements', 'view team employees'],
            'IT Support' => ['view dashboard', 'view system settings', 'view reports', 'view announcements', 'view notifications'],
            'Employee' => ['view dashboard', 'view profile', 'edit profile', 'request own leave', 'view own attendance', 'view own payroll', 'view announcements', 'view notifications', 'view employee announcements'],
        ];

        foreach ($roles as $roleName => $permissionKeys) {
            $role = Role::updateOrCreate(
                ['company_id' => null, 'name' => $roleName],
                ['description' => $roleName . ' system template', 'guard_name' => 'web', 'is_system' => true]
            );

            $permissionIds = collect($permissionKeys)
                ->map(fn (string $key) => $all->get(mb_strtolower($key))?->id)
                ->filter()
                ->values()
                ->all();

            $role->permissions()->sync($permissionIds);
        }
    }
}
