<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $definitions = [
            ['module' => 'dashboard', 'action' => 'view', 'name' => 'view dashboard'],
            ['module' => 'user', 'action' => 'view', 'name' => 'view users'],
            ['module' => 'user', 'action' => 'create', 'name' => 'create users'],
            ['module' => 'user', 'action' => 'edit', 'name' => 'edit users'],
            ['module' => 'user', 'action' => 'delete', 'name' => 'delete users'],
            ['module' => 'user', 'action' => 'assign', 'name' => 'assign roles'],
            ['module' => 'user', 'action' => 'manage', 'name' => 'manage users'],
            ['module' => 'employee', 'action' => 'view', 'name' => 'view employees'],
            ['module' => 'employee', 'action' => 'create', 'name' => 'create employees'],
            ['module' => 'employee', 'action' => 'edit', 'name' => 'edit employees'],
            ['module' => 'employee', 'action' => 'delete', 'name' => 'delete employees'],
            ['module' => 'employee', 'action' => 'manage', 'name' => 'manage employees'],
            ['module' => 'employee', 'action' => 'export', 'name' => 'export employees'],
            ['module' => 'employee', 'action' => 'document.manage', 'name' => 'manage employee documents'],
            ['module' => 'attendance', 'action' => 'view', 'name' => 'view attendance'],
            ['module' => 'attendance', 'action' => 'mark', 'name' => 'manage attendance'],
            ['module' => 'attendance', 'action' => 'edit', 'name' => 'approve attendance'],
            ['module' => 'attendance', 'action' => 'self', 'name' => 'view own attendance'],
            ['module' => 'leave', 'action' => 'request', 'name' => 'manage leaves'],
            ['module' => 'leave', 'action' => 'request.self', 'name' => 'request own leave'],
            ['module' => 'leave', 'action' => 'approve', 'name' => 'approve leaves'],
            ['module' => 'leave', 'action' => 'view', 'name' => 'view leaves'],
            ['module' => 'payroll', 'action' => 'view', 'name' => 'view payroll'],
            ['module' => 'payroll', 'action' => 'generate', 'name' => 'process payroll'],
            ['module' => 'payroll', 'action' => 'edit', 'name' => 'manage payroll'],
            ['module' => 'payroll', 'action' => 'self', 'name' => 'view own payroll'],
            ['module' => 'recruitment', 'action' => 'view', 'name' => 'view recruitment'],
            ['module' => 'recruitment', 'action' => 'create', 'name' => 'manage recruitment'],
            ['module' => 'recruitment', 'action' => 'edit', 'name' => 'edit recruitment'],
            ['module' => 'recruitment', 'action' => 'schedule', 'name' => 'schedule interviews'],
            ['module' => 'recruitment', 'action' => 'offer', 'name' => 'send offers'],
            ['module' => 'performance', 'action' => 'view', 'name' => 'view performance'],
            ['module' => 'performance', 'action' => 'create', 'name' => 'manage performance'],
            ['module' => 'performance', 'action' => 'edit', 'name' => 'edit performance'],
            ['module' => 'reports', 'action' => 'view', 'name' => 'view reports'],
            ['module' => 'reports', 'action' => 'export', 'name' => 'export reports'],
            ['module' => 'reports', 'action' => 'manage', 'name' => 'manage reports'],
            ['module' => 'announcement', 'action' => 'view', 'name' => 'view announcements'],
            ['module' => 'announcement', 'action' => 'manage', 'name' => 'manage announcements'],
            ['module' => 'notification', 'action' => 'view', 'name' => 'view notifications'],
            ['module' => 'notification', 'action' => 'manage', 'name' => 'manage notifications'],
            ['module' => 'announcement', 'action' => 'view.employee', 'name' => 'view employee announcements'],
            ['module' => 'announcement', 'action' => 'view.hr', 'name' => 'view hr announcements'],
            ['module' => 'announcement', 'action' => 'view.manager', 'name' => 'view manager announcements'],
            ['module' => 'employee', 'action' => 'view.team', 'name' => 'view team employees'],
            ['module' => 'settings', 'action' => 'manage', 'name' => 'manage settings'],
            ['module' => 'audit', 'action' => 'view', 'name' => 'view audit logs'],
            ['module' => 'role', 'action' => 'manage', 'name' => 'manage roles'],
            ['module' => 'permission', 'action' => 'manage', 'name' => 'manage permissions'],
            ['module' => 'system', 'action' => 'settings.view', 'name' => 'view system settings'],
            ['module' => 'profile', 'action' => 'view', 'name' => 'view profile'],
            ['module' => 'profile', 'action' => 'edit', 'name' => 'edit profile'],
            ['module' => '*', 'action' => '*', 'name' => '*.*'],
        ];

        foreach ($definitions as $definition) {
            Permission::updateOrCreate(
                ['module' => $definition['module'], 'action' => $definition['action']],
                [
                    'name' => $definition['name'],
                    'guard_name' => 'web',
                    'description' => ucfirst(str_replace('.', ' ', $definition['name'])),
                ]
            );
        }
    }
}
