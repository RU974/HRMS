<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Every employee can refer a candidate, so every role gets it. */
    public function up(): void
    {
        $values = ['name' => 'recruitment:refer'];

        if (Schema::hasColumn('permissions', 'module')) {
            $values['module'] = 'recruitment';
            $values['action'] = 'refer';
        }
        if (Schema::hasColumn('permissions', 'guard_name')) {
            $values['guard_name'] = 'web';
        }
        if (Schema::hasColumn('permissions', 'company_id')) {
            $values['company_id'] = null;
        }

        $lookup = Schema::hasColumn('permissions', 'module')
            ? ['module' => 'recruitment', 'action' => 'refer']
            : ['name' => 'recruitment:refer'];

        $permission = Permission::updateOrCreate($lookup, $values);

        foreach (Role::all() as $role) {
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        Cache::flush();
    }

    public function down(): void
    {
        $permission = Permission::where('name', 'recruitment:refer')->first();

        if ($permission) {
            foreach (Role::all() as $role) {
                $role->permissions()->detach($permission->id);
            }
            $permission->delete();
        }

        Cache::flush();
    }
};
