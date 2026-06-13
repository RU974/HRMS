<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $biometricActions = ['view', 'create', 'edit', 'delete', 'sync', 'manage_mapping'];

        foreach ($biometricActions as $action) {
            $name = "biometric:{$action}";

            $values = ['name' => $name];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = 'biometric';
                $values['action'] = $action;
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }
            if (Schema::hasColumn('permissions', 'company_id')) {
                $values['company_id'] = null;
            }

            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'biometric', 'action' => $action]
                : ['name' => $name];

            Permission::updateOrCreate($lookup, $values);
        }

        $roleAssignments = [
            'Super Admin' => [
                'biometric:view', 'biometric:create', 'biometric:edit', 'biometric:delete',
                'biometric:sync', 'biometric:manage_mapping',
            ],
            'Company Admin' => [
                'biometric:view', 'biometric:create', 'biometric:edit', 'biometric:delete',
                'biometric:sync', 'biometric:manage_mapping',
            ],
            'HR Manager' => [
                'biometric:view', 'biometric:create', 'biometric:edit',
                'biometric:sync', 'biometric:manage_mapping',
            ],
            'Attendance Manager' => [
                'biometric:view', 'biometric:create', 'biometric:edit',
                'biometric:sync', 'biometric:manage_mapping',
            ],
        ];

        foreach ($roleAssignments as $roleName => $permNames) {
            $role = Role::where('name', $roleName)->first();
            if (!$role) {
                continue;
            }

            $permIds = Permission::whereIn('name', $permNames)->pluck('id');
            $role->permissions()->syncWithoutDetaching($permIds);
        }
    }

    public function down(): void
    {
        $biometricPerms = Permission::where('module', 'biometric')->get();
        foreach ($biometricPerms as $perm) {
            $perm->roles()->detach();
            $perm->delete();
        }
    }
};