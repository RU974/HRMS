<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * Everything runs inside a single transaction so a mid-run failure
     * (e.g. PermissionSeeder schema mismatch, RoleSeeder duplicate) leaves
     * the database in a clean state rather than a partial one where the
     * super-admin user exists but has no role assigned.
     *
     * On failure the full error is re-thrown so `php artisan db:seed`
     * still exits with a non-zero code and prints the real cause.
     */
    public function run(): void
    {
        DB::transaction(function (): void {
            // ── 1. Super-admin user ───────────────────────────────
            $adminEmail    = env('DEFAULT_ADMIN_EMAIL',    'admin@example.com');
            $adminPassword = env('DEFAULT_ADMIN_PASSWORD', 'password');
            $adminName     = env('DEFAULT_ADMIN_NAME',     'Super Admin');

            $admin = User::updateOrCreate(
                ['email' => $adminEmail],
                [
                    'name'     => $adminName,
                    'email'    => $adminEmail,
                    'password' => Hash::make($adminPassword),
                ]
            );

            // ── 2. Permissions → Roles → Role-Permission mapping → Workflows
            //      Order matters: each seeder depends on the previous one.
            $this->call([
                PermissionSeeder::class,
                RoleSeeder::class,
                RolePermissionSeeder::class,
                WorkflowSeeder::class,
            ]);

            // ── 3. Assign Super Admin role to the admin user ──────
            //      Done last so the role and its permissions are fully
            //      seeded before assignment.
            $superAdminRole = Role::where('name', User::ROLE_SUPER_ADMIN)
                ->whereNull('company_id')
                ->first();

            if (! $superAdminRole) {
                throw new \RuntimeException(
                    'Super Admin role was not created by RoleSeeder. ' .
                    'Check RoleSeeder::run() for errors.'
                );
            }

            $admin->assignRole($superAdminRole);

            // ── 4. Flush the permission cache so the new role takes effect
            //      immediately without needing a server restart.
            app(\App\Services\PermissionService::class)->flushUserPermissionCache($admin);
        });
    }
}