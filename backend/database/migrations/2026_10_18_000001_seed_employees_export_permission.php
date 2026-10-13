<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** EmployeeController::export checks employees:export, but the permission was never created. */
    private array $roles = ['Company Admin', 'HR Manager'];

    public function up(): void
    {
        $values = ['name' => 'employees:export'];

        if (Schema::hasColumn('permissions', 'module')) {
            $values['module'] = 'employees';
            $values['action'] = 'export';
        }
        if (Schema::hasColumn('permissions', 'guard_name')) {
            $values['guard_name'] = 'web';
        }
        if (Schema::hasColumn('permissions', 'company_id')) {
            $values['company_id'] = null;
        }

        $lookup = Schema::hasColumn('permissions', 'module')
            ? ['module' => 'employees', 'action' => 'export']
            : ['name' => 'employees:export'];

        $permission = Permission::updateOrCreate($lookup, $values);

        foreach (Role::whereIn('name', $this->roles)->get() as $role) {
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        Cache::flush();
    }

    public function down(): void
    {
        $permission = Permission::where('name', 'employees:export')->first();

        if ($permission) {
            foreach (Role::all() as $role) {
                $role->permissions()->detach($permission->id);
            }
            $permission->delete();
        }

        Cache::flush();
    }
};
