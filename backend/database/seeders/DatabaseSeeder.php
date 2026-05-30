<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        $adminEmail = env('DEFAULT_ADMIN_EMAIL', 'admin@example.com');
        $adminPassword = env('DEFAULT_ADMIN_PASSWORD', 'password');

        $admin = User::updateOrCreate(
            ['email' => $adminEmail],
            [
                'name' => env('DEFAULT_ADMIN_NAME', 'Super Admin'),
                'email' => $adminEmail,
                'password' => Hash::make($adminPassword),
            ]
        );

        $this->call([
            PermissionSeeder::class,
            RoleSeeder::class,
        ]);

        $superAdminRole = Role::where('name', User::ROLE_SUPER_ADMIN)->whereNull('company_id')->first();
        if ($superAdminRole) {
            $admin->assignRole($superAdminRole);
        }
    }
}
