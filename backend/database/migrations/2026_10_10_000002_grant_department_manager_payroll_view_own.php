<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Department Managers could not see or download their own payslips because the
 * role lacked payroll:view_own. Grant it (additive only; no existing rows touched).
 */
return new class extends Migration
{
    public function up(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'payroll:view_own')->value('id');

        if (!$permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'name'         => 'payroll:view_own',
                'module'       => 'payroll',
                'action'       => 'view_own',
                'guard_name'   => 'web',
                'display_name' => 'View Own Payslips',
                'description'  => 'Allows an employee to view and download only their own payslips.',
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);
        }

        $roles = DB::table('roles')->where('name', 'Department Manager')->get();

        foreach ($roles as $role) {
            $alreadyAssigned = DB::table('permission_role')
                ->where('role_id', $role->id)
                ->where('permission_id', $permissionId)
                ->exists();

            if (!$alreadyAssigned) {
                DB::table('permission_role')->insert([
                    'role_id'       => $role->id,
                    'permission_id' => $permissionId,
                    'company_id'    => $role->company_id ?? null,
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'payroll:view_own')->value('id');
        $roleIds = DB::table('roles')->where('name', 'Department Manager')->pluck('id');

        if ($permissionId && $roleIds->isNotEmpty()) {
            DB::table('permission_role')
                ->where('permission_id', $permissionId)
                ->whereIn('role_id', $roleIds)
                ->delete();
        }
    }
};
