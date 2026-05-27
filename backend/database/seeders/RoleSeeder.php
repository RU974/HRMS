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
        $all = Permission::all()->keyBy(fn (Permission $p) => $p->module . '.' . $p->action);

        $roles = [
            'Super Admin' => ['*.*'],
            'Company Admin' => ['dashboard.view', 'employee.view', 'employee.create', 'employee.edit', 'employee.delete', 'attendance.view', 'attendance.mark', 'attendance.edit', 'leave.view', 'leave.approve', 'payroll.view', 'payroll.generate', 'payroll.edit', 'recruitment.view', 'recruitment.create', 'recruitment.edit', 'recruitment.schedule', 'recruitment.offer', 'performance.view', 'performance.create', 'performance.edit', 'reports.view', 'reports.export', 'system.settings.view', 'role.manage', 'permission.manage', 'user.manage'],
            'HR Manager' => ['dashboard.view', 'employee.view', 'employee.create', 'employee.edit', 'employee.delete', 'employee.export', 'employee.document.manage', 'attendance.view', 'attendance.mark', 'attendance.edit', 'leave.request', 'leave.approve', 'leave.view', 'performance.view', 'performance.create', 'performance.edit', 'reports.view', 'reports.export'],
            'HR Executive' => ['dashboard.view', 'employee.view', 'employee.create', 'employee.edit', 'attendance.view', 'attendance.mark', 'leave.request', 'leave.view', 'reports.view'],
            'Payroll Manager' => ['dashboard.view', 'payroll.view', 'payroll.generate', 'payroll.edit', 'reports.view', 'reports.export'],
            'Attendance Manager' => ['dashboard.view', 'attendance.view', 'attendance.mark', 'attendance.edit'],
            'Recruiter' => ['dashboard.view', 'recruitment.view', 'recruitment.create', 'recruitment.edit', 'recruitment.schedule', 'recruitment.offer'],
            'Department Manager' => ['dashboard.view', 'employee.view', 'attendance.view', 'leave.view', 'leave.approve', 'performance.view', 'performance.edit'],
            'IT Support' => ['dashboard.view', 'system.settings.view', 'reports.view'],
            'Employee' => ['dashboard.view', 'profile.view', 'profile.edit', 'leave.request', 'attendance.self'],
        ];

        foreach ($roles as $roleName => $permissionKeys) {
            $role = Role::updateOrCreate(
                ['company_id' => null, 'name' => $roleName],
                ['description' => $roleName . ' system template', 'is_system' => true]
            );

            $permissionIds = collect($permissionKeys)
                ->map(fn (string $key) => $all->get($key)?->id)
                ->filter()
                ->values()
                ->all();

            $role->permissions()->sync($permissionIds);
        }

        $admin = User::query()->orderBy('id')->first();
        if ($admin) {
            $superAdminRole = Role::where('name', 'Super Admin')->whereNull('company_id')->first();
            if ($superAdminRole) {
                $admin->rolesRelation()->syncWithoutDetaching([$superAdminRole->id => ['scope' => json_encode(new \stdClass())]]);
            }
        }
    }
}
