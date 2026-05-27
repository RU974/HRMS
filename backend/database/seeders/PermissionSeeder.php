<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $map = [
            'dashboard' => ['view'],
            'employee' => ['view', 'create', 'edit', 'delete', 'export', 'document.manage'],
            'attendance' => ['view', 'mark', 'edit', 'self'],
            'leave' => ['request', 'approve', 'view'],
            'payroll' => ['view', 'generate', 'edit'],
            'recruitment' => ['view', 'create', 'edit', 'schedule', 'offer'],
            'performance' => ['view', 'create', 'edit'],
            'system' => ['settings.view'],
            'role' => ['manage'],
            'permission' => ['manage'],
            'user' => ['manage'],
            'profile' => ['view', 'edit'],
            'reports' => ['view', 'export'],
        ];

        foreach ($map as $module => $actions) {
            foreach ($actions as $action) {
                Permission::updateOrCreate(
                    ['module' => $module, 'action' => $action],
                    ['description' => ucfirst($module) . ' ' . str_replace('_', ' ', $action)]
                );
            }
        }

        Permission::updateOrCreate(
            ['module' => '*', 'action' => '*'],
            ['description' => 'Super Admin full access']
        );
    }
}
