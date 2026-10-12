<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;

return new class extends Migration
{
    /** Reviewing attendance correction requests needs attendance:approve, which no non-admin role held. */
    private array $roles = ['Attendance Manager', 'HR Manager'];

    public function up(): void
    {
        $permission = Permission::where('name', 'attendance:approve')->first();

        if (! $permission) {
            return;
        }

        foreach ($this->roles as $name) {
            Role::where('name', $name)->get()->each(fn (Role $role) => $role->permissions()->syncWithoutDetaching([$permission->id]));
        }

        Cache::flush();
    }

    public function down(): void
    {
        $permission = Permission::where('name', 'attendance:approve')->first();

        if ($permission) {
            foreach ($this->roles as $name) {
                Role::where('name', $name)->get()->each(fn (Role $role) => $role->permissions()->detach($permission->id));
            }
        }

        Cache::flush();
    }
};
