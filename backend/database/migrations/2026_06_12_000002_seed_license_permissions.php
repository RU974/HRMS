<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Adds 'licenses' module permissions and grants them to Super Admin + Company Admin.
 * Safe to run multiple times (uses updateOrCreate).
 */
return new class extends Migration
{
    private array $permissions = [
        ['module' => 'licenses', 'action' => 'view',            'name' => 'licenses:view'],
        ['module' => 'licenses', 'action' => 'create',          'name' => 'licenses:create'],
        ['module' => 'licenses', 'action' => 'edit',            'name' => 'licenses:edit'],
        ['module' => 'licenses', 'action' => 'delete',          'name' => 'licenses:delete'],
        ['module' => 'licenses', 'action' => 'manage_settings', 'name' => 'licenses:manage_settings'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $created = [];

        foreach ($this->permissions as $def) {
            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => $def['module'], 'action' => $def['action']]
                : ['name'   => $def['name']];

            $values = ['name' => $def['name']];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = $def['module'];
                $values['action'] = $def['action'];
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }

            $permission = Permission::updateOrCreate($lookup, $values);
            $created[]  = $permission->id;
        }

        // Grant all licensing permissions to Super Admin and Company Admin
        $targetRoles = ['Super Admin', 'Company Admin'];

        foreach ($targetRoles as $roleName) {
            $role = Role::where('name', $roleName)->first();
            if (! $role) {
                continue;
            }
            // Attach only missing permissions (avoids duplicates)
            $existing  = $role->permissions()->pluck('permissions.id')->toArray();
            $toAttach  = array_diff($created, $existing);
            if ($toAttach) {
                $role->permissions()->attach($toAttach);
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $names = array_column($this->permissions, 'name');
        $perms = Permission::whereIn('name', $names)->get();

        foreach ($perms as $perm) {
            // Detach from all roles before deleting
            $perm->roles()->detach();
            $perm->delete();
        }
    }
};