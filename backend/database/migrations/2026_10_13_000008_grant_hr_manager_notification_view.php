<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;

/**
 * HR Managers approve offers, leave and more, and are sent in-app notifications for them,
 * but the role could not open the notification centre (GET /notifications was a 403).
 * Existing grants are never removed.
 */
return new class extends Migration
{
    public function up(): void
    {
        $permission = Permission::query()->where('name', 'notification:view')->first();

        if (! $permission) {
            return;
        }

        foreach (Role::where('name', 'HR Manager')->get() as $role) {
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        // Permissions are cached per user; bust it so the grant applies immediately.
        Cache::flush();
    }

    public function down(): void
    {
        $permission = Permission::query()->where('name', 'notification:view')->first();

        if (! $permission) {
            return;
        }

        foreach (Role::where('name', 'HR Manager')->get() as $role) {
            $role->permissions()->detach($permission->id);
        }

        Cache::flush();
    }
};
