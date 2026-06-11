<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

/**
 * Gap 3 Fix: Removes `leaves:approve` from the Employee role (privilege
 * escalation bug) and fixes IT Support `settings:view` -> `settings:manage_settings`.
 * Also adds `payroll:view` to HR Manager.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Remove leaves:approve from Employee role
        $employeeRole = Role::where('name', 'Employee')->first();
        if ($employeeRole) {
            $approvePermission = Permission::where('name', 'leaves:approve')->first();
            if ($approvePermission) {
                $employeeRole->permissions()->detach($approvePermission->id);
            }
        }

        // Fix IT Support: swap settings:view for settings:manage_settings
        $itSupportRole = Role::where('name', 'IT Support')->first();
        if ($itSupportRole) {
            $settingsView = Permission::where('name', 'settings:view')->first();
            $settingsManage = Permission::where('name', 'settings:manage_settings')->first();

            if ($settingsView) {
                $itSupportRole->permissions()->detach($settingsView->id);
            }
            if ($settingsManage) {
                $itSupportRole->permissions()->syncWithoutDetaching([$settingsManage->id]);
            }
        }

        // Add payroll:view to HR Manager (Gap 9)
        $hrManagerRole = Role::where('name', 'HR Manager')->first();
        if ($hrManagerRole) {
            $payrollView = Permission::where('name', 'payroll:view')->first();
            if ($payrollView) {
                $hrManagerRole->permissions()->syncWithoutDetaching([$payrollView->id]);
            }
        }

        // Add recruitment:delete + recruitment:manage_settings to Recruiter (Gap 10)
        $recruiterRole = Role::where('name', 'Recruiter')->first();
        if ($recruiterRole) {
            $perms = Permission::whereIn('name', ['recruitment:delete', 'recruitment:manage_settings'])->pluck('id');
            $recruiterRole->permissions()->syncWithoutDetaching($perms);
        }
    }

    public function down(): void
    {
        // Re-attach leaves:approve to Employee (reverting the fix)
        $employeeRole = Role::where('name', 'Employee')->first();
        $approvePermission = Permission::where('name', 'leaves:approve')->first();
        if ($employeeRole && $approvePermission) {
            $employeeRole->permissions()->syncWithoutDetaching([$approvePermission->id]);
        }
    }
};
