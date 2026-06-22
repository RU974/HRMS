<?php

use App\Models\Permission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $actions = ['view', 'create', 'edit', 'delete', 'assign', 'manage_settings'];

        foreach ($actions as $action) {
            $name = 'tickets:' . $action;

            $lookup = Schema::hasColumn('permissions', 'module')
                ? ['module' => 'tickets', 'action' => $action]
                : ['name' => $name];

            $values = ['name' => $name];

            if (Schema::hasColumn('permissions', 'module')) {
                $values['module'] = 'tickets';
                $values['action'] = $action;
            }
            if (Schema::hasColumn('permissions', 'description')) {
                $values['description'] = null;
            }
            if (Schema::hasColumn('permissions', 'company_id')) {
                $values['company_id'] = null;
            }
            if (Schema::hasColumn('permissions', 'guard_name')) {
                $values['guard_name'] = 'web';
            }

            try {
                Permission::updateOrCreate($lookup, $values);
            } catch (\Throwable) {
                continue;
            }
        }
    }

    public function down(): void
    {
        Permission::where('module', 'tickets')->delete();
    }
};
