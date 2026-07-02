<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Ensures the Company Admin role always has licenses:view and
 * licenses:manage_settings so the licensing tab loads and activation works.
 *
 * The RolePermissionSeeder previously omitted these permissions, so re-running
 * db:seed would strip the permissions added by 2026_06_12_000002. This
 * migration is idempotent (uses attach with deduplication) and safe to re-run.
 */
return new class extends Migration
{
    private array $required = [
        'licenses:view',
        'licenses:manage_settings',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('roles')) {
            return;
        }

        $permissionIds = Permission::whereIn('name', $this->required)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->values()
            ->all();

        if (empty($permissionIds)) {
            return;
        }

        // Update ALL Company Admin roles (global + any company-scoped copies)
        Role::where('name', 'Company Admin')->each(function (Role $role) use ($permissionIds) {
            $existing = $role->permissions()->pluck('permissions.id')->map(fn ($id) => (int) $id)->all();
            $toAttach = array_diff($permissionIds, $existing);
            if ($toAttach) {
                $role->permissions()->attach($toAttach);
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('roles')) {
            return;
        }

        $permissionIds = Permission::whereIn('name', $this->required)->pluck('id')->all();

        Role::where('name', 'Company Admin')->each(function (Role $role) use ($permissionIds) {
            $role->permissions()->detach($permissionIds);
        });
    }
};
