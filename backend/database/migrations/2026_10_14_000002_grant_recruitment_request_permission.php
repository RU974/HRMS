<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Roles that may raise a job requisition without holding full recruitment access. */
    private array $roles = ['Department Manager'];

    public function up(): void
    {
        $values = ['name' => 'recruitment:request'];

        if (Schema::hasColumn('permissions', 'module')) {
            $values['module'] = 'recruitment';
            $values['action'] = 'request';
        }
        if (Schema::hasColumn('permissions', 'guard_name')) {
            $values['guard_name'] = 'web';
        }
        if (Schema::hasColumn('permissions', 'company_id')) {
            $values['company_id'] = null;
        }

        $lookup = Schema::hasColumn('permissions', 'module')
            ? ['module' => 'recruitment', 'action' => 'request']
            : ['name' => 'recruitment:request'];

        $permission = Permission::updateOrCreate($lookup, $values);

        foreach (Role::whereIn('name', $this->roles)->get() as $role) {
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        Cache::flush();
    }

    public function down(): void
    {
        $permission = Permission::where('name', 'recruitment:request')->first();

        if ($permission) {
            foreach (Role::all() as $role) {
                $role->permissions()->detach($permission->id);
            }
            $permission->delete();
        }

        Cache::flush();
    }
};
