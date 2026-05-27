<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $map = [
            'dashboard' => ['view', 'configure_widgets'],
            'employees' => ['create', 'read', 'update', 'delete', 'export', 'manage_documents'],
            'attendance' => ['mark_own', 'mark_others', 'view_all', 'edit', 'export'],
            'leave' => ['apply', 'approve', 'reject', 'view_all', 'configure_policies'],
            'payroll' => ['view_payslips', 'process', 'manage_components', 'approve', 'export'],
            'recruitment' => ['create_job', 'manage_candidates', 'schedule_interview', 'extend_offer', 'view_all'],
            'performance' => ['set_goals', 'write_review', 'view_all_reviews'],
            'timetracking' => ['log_time', 'approve_timesheet', 'view_all'],
            'reports' => ['view_basic', 'view_sensitive', 'export'],
            'settings' => ['general', 'manage_roles', 'manage_permissions', 'integrations', 'billing'],
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
