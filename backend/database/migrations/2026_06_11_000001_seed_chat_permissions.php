<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Gap 2 Fix: Seeds the missing `chat` module permissions and assigns
 * them to appropriate roles so existing live databases are patched
 * without a full re-seed.
 */
return new class extends Migration
{
    public function up(): void
    {
        $chatActions = ['view', 'create', 'edit', 'delete', 'manage_settings'];

        foreach ($chatActions as $action) {
            $name = "chat:{$action}";

            $values = ['name' => $name];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = 'chat';
                $values['action'] = $action;
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }
            if (Schema::hasColumn('permissions', 'company_id')) {
                $values['company_id'] = null;
            }

            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'chat', 'action' => $action]
                : ['name' => $name];

            Permission::updateOrCreate($lookup, $values);
        }

        // Assign chat:view + chat:create to roles that should have chat access
        $roleAssignments = [
            'Employee'          => ['chat:view', 'chat:create'],
            'HR Manager'        => ['chat:view', 'chat:create'],
            'HR Executive'      => ['chat:view', 'chat:create'],
            'Recruiter'         => ['chat:view', 'chat:create'],
            'Department Manager'=> ['chat:view', 'chat:create'],
            'Payroll Manager'   => ['chat:view', 'chat:create'],
            'Attendance Manager'=> ['chat:view', 'chat:create'],
            'IT Support'        => ['chat:view', 'chat:create'],
            'Company Admin'     => ['chat:view', 'chat:create', 'chat:edit', 'chat:delete', 'chat:manage_settings'],
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
        // Remove chat permissions (detach from roles first)
        $chatPerms = Permission::where('module', 'chat')->get();
        foreach ($chatPerms as $perm) {
            $perm->roles()->detach();
            $perm->delete();
        }
    }
};
