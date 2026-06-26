<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $role = Role::where('name', 'Department Manager')->first();

        if (!$role) {
            return;
        }

        $permissions = Permission::whereIn('name', ['announcement:view', 'notification:view'])->pluck('id');

        if ($permissions->isEmpty()) {
            return;
        }

        $role->permissions()->syncWithoutDetaching($permissions->all());
    }

    public function down(): void
    {
        $role = Role::where('name', 'Department Manager')->first();

        if (!$role) {
            return;
        }

        $permissions = Permission::whereIn('name', ['announcement:view', 'notification:view'])->pluck('id');

        if ($permissions->isEmpty()) {
            return;
        }

        $role->permissions()->detach($permissions->all());
    }
};
