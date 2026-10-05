<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var array<string, list<string>> */
    private array $grants = [
        'Company Admin'      => ['create', 'edit', 'delete'],
        'Attendance Manager' => ['create', 'edit'],
        'HR Manager'         => ['create', 'edit'],
    ];

    public function up(): void
    {
        $actions = ['create', 'edit', 'delete'];

        foreach ($actions as $action) {
            $values = ['name' => "biometric:{$action}"];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = 'biometric';
                $values['action'] = $action;
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }
            if (Schema::hasColumn('permissions', 'company_id')) {
                $values['company_id'] = null;
            }

            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'biometric', 'action' => $action]
                : ['name' => "biometric:{$action}"];

            Permission::updateOrCreate($lookup, $values);
        }

        foreach ($this->grants as $roleName => $roleActions) {
            $role = Role::where('name', $roleName)->first();
            if (!$role) {
                continue;
            }

            $ids = Permission::whereIn('name', array_map(fn ($a) => "biometric:{$a}", $roleActions))->pluck('id');
            $role->permissions()->syncWithoutDetaching($ids);
        }

        // Permissions are cached per-user for 30 minutes; bust it so this takes effect immediately.
        Cache::flush();
    }

    public function down(): void
    {
        $role = Role::where('name', 'Company Admin')->first();

        if ($role) {
            $ids = Permission::whereIn('name', ['biometric:create', 'biometric:edit', 'biometric:delete'])->pluck('id');
            $role->permissions()->detach($ids);
        }

        Cache::flush();
    }
};
