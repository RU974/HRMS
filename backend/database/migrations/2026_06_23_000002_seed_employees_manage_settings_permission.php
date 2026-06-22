<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $existing = DB::table('permissions')
            ->where('name', 'employees:manage_settings')
            ->first();

        if ($existing) {
            $permId = $existing->id;
        } else {
            $permId = DB::table('permissions')->insertGetId([
                'module'     => 'employees',
                'action'     => 'manage_settings',
                'name'       => 'employees:manage_settings',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Super Admin, Company Admin, and HR Manager should be able to bulk-reassign employees.
        // IT Support (which holds settings:manage_settings) should not.
        $roleIds = DB::table('roles')
            ->whereIn('name', ['Super Admin', 'Company Admin', 'HR Manager'])
            ->pluck('id');

        $rows = $roleIds->map(fn ($roleId) => [
            'role_id'       => $roleId,
            'permission_id' => $permId,
        ])->all();

        if (!empty($rows)) {
            DB::table('permission_role')->insertOrIgnore($rows);
        }
    }

    public function down(): void
    {
        DB::table('permissions')
            ->where('module', 'employees')
            ->where('action', 'manage_settings')
            ->delete();
    }
};
