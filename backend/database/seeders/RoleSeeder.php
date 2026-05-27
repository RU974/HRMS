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
        $all = Permission::all()->keyBy(fn (Permission $p) => $p->module . ':' . $p->action);

        $roles = [
            'Super Admin' => ['*:*'],
            'HR Manager' => [
                'employees:create','employees:read','employees:update','employees:export','employees:manage_documents',
                'attendance:view_all','attendance:edit',
                'leave:approve','leave:reject','leave:view_all','leave:configure_policies',
                'payroll:view_payslips','payroll:export',
                'recruitment:create_job','recruitment:manage_candidates','recruitment:schedule_interview','recruitment:extend_offer','recruitment:view_all',
                'performance:set_goals','performance:write_review','performance:view_all_reviews',
                'reports:view_basic','reports:view_sensitive','reports:export',
                'settings:manage_roles','settings:manage_permissions',
            ],
            'HR Executive' => [
                'employees:create','employees:read','employees:update','employees:export',
                'attendance:mark_others','attendance:view_all',
                'leave:apply','leave:view_all',
                'payroll:view_payslips',
                'reports:view_basic',
            ],
            'Payroll Manager' => [
                'payroll:view_payslips','payroll:process','payroll:manage_components','payroll:approve','payroll:export',
                'reports:view_basic','reports:export',
            ],
            'Recruiter' => [
                'recruitment:create_job','recruitment:manage_candidates','recruitment:schedule_interview','recruitment:extend_offer','recruitment:view_all',
                'employees:read','dashboard:view',
            ],
            'Line Manager' => [
                'employees:read',
                'attendance:view_all',
                'leave:apply','leave:approve',
                'performance:set_goals','performance:write_review',
                'dashboard:view',
            ],
            'Employee (Self)' => [
                'employees:read','employees:update',
                'attendance:mark_own',
                'leave:apply',
                'payroll:view_payslips',
                'performance:set_goals',
                'dashboard:view',
            ],
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

        $admin = User::where('role', User::ROLE_SUPER_ADMIN)->first();
        if ($admin) {
            $superAdminRole = Role::where('name', 'Super Admin')->whereNull('company_id')->first();
            if ($superAdminRole) {
                $admin->rolesRelation()->syncWithoutDetaching([$superAdminRole->id => ['scope' => json_encode(new \stdClass())]]);
            }
        }
    }
}
