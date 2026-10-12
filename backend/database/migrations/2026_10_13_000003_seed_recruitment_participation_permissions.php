<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $actions = ['interview', 'onboarding_task'];

    public function up(): void
    {
        $ids = [];

        foreach ($this->actions as $action) {
            $name = "recruitment:{$action}";
            $values = ['name' => $name];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = 'recruitment';
                $values['action'] = $action;
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }
            if (Schema::hasColumn('permissions', 'company_id')) {
                $values['company_id'] = null;
            }

            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'recruitment', 'action' => $action]
                : ['name' => $name];

            $ids[] = Permission::updateOrCreate($lookup, $values)->id;
        }

        // Every role except Super Admin (which already has everything) can act on its own
        // interviews and onboarding tasks. Existing grants are never removed.
        foreach (Role::where('name', '!=', 'Super Admin')->get() as $role) {
            $role->permissions()->syncWithoutDetaching($ids);
        }

        // Permissions are cached per-user; bust it so the grant takes effect immediately.
        Cache::flush();
    }

    public function down(): void
    {
        $ids = Permission::whereIn('name', array_map(fn ($action) => "recruitment:{$action}", $this->actions))->pluck('id');

        foreach (Role::all() as $role) {
            $role->permissions()->detach($ids);
        }

        Permission::whereIn('id', $ids)->delete();

        Cache::flush();
    }
};
