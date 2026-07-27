<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private array $inventoryActions = ['view', 'create', 'edit'];

    public function up(): void
    {
        // 1. Ensure the inventory permissions this role needs exist
        foreach ($this->inventoryActions as $action) {
            $name = "inventory:{$action}";

            $exists = DB::table('permissions')
                ->where('name', $name)
                ->exists();

            if (! $exists) {
                $row = ['name' => $name, 'created_at' => now(), 'updated_at' => now()];

                if ($this->hasColumn('permissions', 'module'))   $row['module']     = 'inventory';
                if ($this->hasColumn('permissions', 'action'))   $row['action']     = $action;
                if ($this->hasColumn('permissions', 'guard_name')) $row['guard_name'] = 'web';

                DB::table('permissions')->insert($row);
            }
        }

        // 2. Find the global IT Support role (company_id IS NULL)
        $role = DB::table('roles')
            ->where('name', 'IT Support')
            ->whereNull('company_id')
            ->first();

        if (! $role) {
            return;
        }

        // 3. Attach any missing inventory permissions to the role
        $permissionIds = DB::table('permissions')
            ->where('module', 'inventory')
            ->whereIn('action', $this->inventoryActions)
            ->pluck('id');

        if ($permissionIds->isEmpty()) {
            // Fallback: match by name when module/action columns may not exist
            $permissionIds = DB::table('permissions')
                ->whereIn('name', array_map(fn($a) => "inventory:{$a}", $this->inventoryActions))
                ->pluck('id');
        }

        foreach ($permissionIds as $permId) {
            $alreadyAssigned = DB::table('permission_role')
                ->where('role_id', $role->id)
                ->where('permission_id', $permId)
                ->exists();

            if (! $alreadyAssigned) {
                DB::table('permission_role')->insert([
                    'role_id'       => $role->id,
                    'permission_id' => $permId,
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
            }
        }

        // 4. Flush the cached permissions for every user who holds this role
        //    so they see the change immediately without waiting for cache expiry
        $userIds = DB::table('model_has_roles')
            ->where('role_id', $role->id)
            ->pluck('model_id');

        foreach ($userIds as $userId) {
            $cacheKey = "rbac:user_permissions:{$userId}";
            cache()->forget($cacheKey);
        }
    }

    public function down(): void
    {
        $role = DB::table('roles')
            ->where('name', 'IT Support')
            ->whereNull('company_id')
            ->first();

        if (! $role) {
            return;
        }

        $permissionIds = DB::table('permissions')
            ->whereIn('name', array_map(fn($a) => "inventory:{$a}", $this->inventoryActions))
            ->pluck('id');

        DB::table('permission_role')
            ->where('role_id', $role->id)
            ->whereIn('permission_id', $permissionIds)
            ->delete();
    }

    private function hasColumn(string $table, string $column): bool
    {
        return in_array($column, DB::getSchemaBuilder()->getColumnListing($table), true);
    }
};
