<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;

return new class extends Migration
{
    public function up(): void
    {
        $role = Role::where('name', 'HR Executive')->first();

        if (!$role) {
            return;
        }

        $permissionIds = Permission::whereIn('name', ['tickets:view', 'tickets:create'])->pluck('id');

        $role->permissions()->syncWithoutDetaching($permissionIds);

        // Permissions are cached per-user for 30 minutes; bust it so this takes effect immediately.
        Cache::flush();
    }

    public function down(): void
    {
        $role = Role::where('name', 'HR Executive')->first();

        if (!$role) {
            return;
        }

        $permissionIds = Permission::whereIn('name', ['tickets:view', 'tickets:create'])->pluck('id');

        $role->permissions()->detach($permissionIds);

        Cache::flush();
    }
};
