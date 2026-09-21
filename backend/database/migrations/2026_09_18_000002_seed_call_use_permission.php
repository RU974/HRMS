<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the `call:use` permission (start, answer and join audio/video calls) and
 * grants it to every role that already holds `chat:create`, so existing
 * installations keep working without a manual re-seed. Per-user permission
 * caches are flushed so the change is effective immediately, not after 30 min.
 */
return new class extends Migration
{
    public function up(): void
    {
        $values = ['name' => 'call:use'];
        if (Schema::hasColumn('permissions', 'module')) {
            $values['module'] = 'call';
            $values['action'] = 'use';
        }
        if (Schema::hasColumn('permissions', 'guard_name')) {
            $values['guard_name'] = 'web';
        }
        if (Schema::hasColumn('permissions', 'company_id')) {
            $values['company_id'] = null;
        }

        $lookup = Schema::hasColumn('permissions', 'module')
            ? ['module' => 'call', 'action' => 'use']
            : ['name' => 'call:use'];

        $permission = Permission::updateOrCreate($lookup, $values);

        $chatCreate = Permission::where('name', 'chat:create')->first();
        if ($chatCreate) {
            $chatCreate->roles()->get()->each(
                fn (Role $role) => $role->permissions()->syncWithoutDetaching([$permission->id])
            );
        }

        $service = app(PermissionService::class);
        User::query()->select('id')->chunkById(500, function ($users) use ($service): void {
            foreach ($users as $user) {
                $service->flushUserPermissionCache($user);
            }
        });
    }

    public function down(): void
    {
        $permission = Permission::where('name', 'call:use')->first();
        if ($permission) {
            $permission->roles()->detach();
            $permission->delete();
        }
    }
};
