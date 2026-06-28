<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $modules = [
            'dashboard','users','employees','leaves','attendance','payroll','recruitment','documents','approvals','audit_logs','settings','reports','notification','announcement','performance','chat','licenses','inventory','tickets'
        ];

        $actions = ['view','create','edit','delete','approve','export','import','assign','manage_settings'];

        foreach ($modules as $module) {
            foreach ($actions as $action) {
                $name = $module . ':' . $action;

                $lookup = Schema::hasColumn('permissions', 'module')
                    ? ['module' => $module, 'action' => $action]
                    : ['name' => $name];

                $values = ['name' => $name];

                if (Schema::hasColumn('permissions', 'module')) {
                    $values['module'] = $module;
                    $values['action'] = $action;
                }

                if (Schema::hasColumn('permissions', 'description')) {
                    $values['description'] = null;
                }

                if (Schema::hasColumn('permissions', 'company_id')) {
                    $values['company_id'] = null;
                }

                if (Schema::hasColumn('permissions', 'guard_name')) {
                    $values['guard_name'] = 'web';
                }

                try {
                    Permission::updateOrCreate($lookup, $values);
                } catch (\Throwable $e) {
                    // ignore schema mismatch in older DBs
                    continue;
                }
            }
        }

        // Approval-specific permissions
        $approvalPermissions = [
            ['name' => 'approvals:view'],
            ['name' => 'approvals:approve'],
            ['name' => 'approvals:manage_settings'],
        ];

        foreach ($approvalPermissions as $perm) {
            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'approvals', 'action' => str_replace('approvals:', '', $perm['name'])]
                : ['name' => $perm['name']];
            
            $values = $perm;
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }
            
            try {
                Permission::updateOrCreate($lookup, $values);
            } catch (\Throwable $e) {
                continue;
            }
        }

        // additional specific permissions
        $specific = [
            ['module' => 'user', 'action' => 'assign', 'name' => 'user:assign'],
            ['module' => 'employee', 'action' => 'document.manage', 'name' => 'employee:document.manage'],
            ['module' => 'system', 'action' => 'settings.view', 'name' => 'system:settings.view'],
            // biometric — seeded here so db:seed alone is sufficient without running individual migrations
            ['module' => 'biometric', 'action' => 'view', 'name' => 'biometric:view'],
            ['module' => 'biometric', 'action' => 'sync', 'name' => 'biometric:sync'],
            ['module' => 'biometric', 'action' => 'manage_mapping', 'name' => 'biometric:manage_mapping'],
            // reports:view_own used by Employee role and route guards
            ['module' => 'reports', 'action' => 'view_own', 'name' => 'reports:view_own'],
            ['module' => '*', 'action' => '*', 'name' => '*.*'],
        ];

        foreach ($specific as $def) {
            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => $def['module'], 'action' => $def['action']]
                : ['name' => $def['name']];

            $values = ['name' => $def['name']];
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }

            try {
                Permission::updateOrCreate($lookup, $values);
            } catch (\Throwable $e) {
                continue;
            }
        }
    }
}