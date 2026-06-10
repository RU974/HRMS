<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * GAP-R1: Add reports:view_own permission so employees can view their own
 * attendance, leave, payroll, and analytics report data.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Insert the permission if it does not already exist.
        $exists = DB::table('permissions')->where('name', 'reports:view_own')->exists();

        if (!$exists) {
            $permissionId = DB::table('permissions')->insertGetId([
                'name'         => 'reports:view_own',
                'module'       => 'reports',
                'action'       => 'view_own',
                'guard_name'   => 'web',
                'display_name' => 'View Own Reports',
                'description'  => 'Allows an employee to view their own attendance, leave, payroll, and analytics report data.',
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);
        } else {
            $permissionId = DB::table('permissions')->where('name', 'reports:view_own')->value('id');
        }

        // Assign to the Employee role via the correct pivot table: permission_role
        $employeeRole = DB::table('roles')->where('name', 'Employee')->first();

        if ($employeeRole && $permissionId) {
            $alreadyAssigned = DB::table('permission_role')
                ->where('role_id', $employeeRole->id)
                ->where('permission_id', $permissionId)
                ->exists();

            if (!$alreadyAssigned) {
                DB::table('permission_role')->insert([
                    'role_id'       => $employeeRole->id,
                    'permission_id' => $permissionId,
                    'company_id'    => null,
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        $permission = DB::table('permissions')->where('name', 'reports:view_own')->first();

        if ($permission) {
            DB::table('permission_role')->where('permission_id', $permission->id)->delete();
            DB::table('permissions')->where('id', $permission->id)->delete();
        }
    }
};
