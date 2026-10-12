<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;

return new class extends Migration
{
    /** The system log viewer needs audit_logs:view as well as settings access; Company Admin held only the latter. */
    public function up(): void
    {
        $permission = Permission::where('name', 'audit_logs:view')->first();

        if ($permission) {
            Role::where('name', 'Company Admin')->get()->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$permission->id]));
            Cache::flush();
        }
    }

    public function down(): void
    {
        $permission = Permission::where('name', 'audit_logs:view')->first();

        if ($permission) {
            Role::where('name', 'Company Admin')->get()->each(fn (Role $role) => $role->permissions()->detach($permission->id));
            Cache::flush();
        }
    }
};
