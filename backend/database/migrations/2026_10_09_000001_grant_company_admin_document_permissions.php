<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $actions = ['view', 'create', 'edit', 'delete'];

    public function up(): void
    {
        foreach ($this->actions as $action) {
            $values = ['name' => "documents:{$action}"];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = 'documents';
                $values['action'] = $action;
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }
            if (Schema::hasColumn('permissions', 'company_id')) {
                $values['company_id'] = null;
            }

            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'documents', 'action' => $action]
                : ['name' => "documents:{$action}"];

            Permission::updateOrCreate($lookup, $values);
        }

        $ids = Permission::whereIn('name', array_map(fn ($a) => "documents:{$a}", $this->actions))->pluck('id');

        // Roles may exist per company, so grant to every Company Admin role.
        foreach (Role::where('name', 'Company Admin')->get() as $role) {
            $role->permissions()->syncWithoutDetaching($ids);
        }

        // Permissions are cached per-user for 30 minutes; bust it so this takes effect immediately.
        Cache::flush();
    }

    public function down(): void
    {
        $ids = Permission::whereIn('name', array_map(fn ($a) => "documents:{$a}", $this->actions))->pluck('id');

        foreach (Role::where('name', 'Company Admin')->get() as $role) {
            $role->permissions()->detach($ids);
        }

        Cache::flush();
    }
};
