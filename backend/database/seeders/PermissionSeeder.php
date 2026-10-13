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
            ['module' => 'biometric', 'action' => 'create', 'name' => 'biometric:create'],
            ['module' => 'biometric', 'action' => 'edit', 'name' => 'biometric:edit'],
            ['module' => 'biometric', 'action' => 'delete', 'name' => 'biometric:delete'],
            ['module' => 'biometric', 'action' => 'sync', 'name' => 'biometric:sync'],
            ['module' => 'biometric', 'action' => 'manage_mapping', 'name' => 'biometric:manage_mapping'],
            // reports:view_own used by Employee role and route guards
            ['module' => 'reports', 'action' => 'view_own', 'name' => 'reports:view_own'],
            // payroll:view_own lets an employee view/download only their own payslips
            ['module' => 'payroll', 'action' => 'view_own', 'name' => 'payroll:view_own'],
            // employees:view_all grants company-wide visibility, bypassing the
            // manager/department/branch narrowing applied to plain employees:view holders
            ['module' => 'employees', 'action' => 'view_all', 'name' => 'employees:view_all'],
            ['module' => 'employees', 'action' => 'export', 'name' => 'employees:export'],
            // call:use lets a user start, answer and join audio/video calls
            ['module' => 'call', 'action' => 'use', 'name' => 'call:use'],
            // recruitment participation for non-recruiters: score own interviews / complete own onboarding tasks
            ['module' => 'recruitment', 'action' => 'interview', 'name' => 'recruitment:interview'],
            ['module' => 'recruitment', 'action' => 'onboarding_task', 'name' => 'recruitment:onboarding_task'],
            // hiring managers can raise a job requisition without full recruitment access
            ['module' => 'recruitment', 'action' => 'request', 'name' => 'recruitment:request'],
            // any employee can refer a candidate for an open job and follow their own referrals
            ['module' => 'recruitment', 'action' => 'refer', 'name' => 'recruitment:refer'],
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