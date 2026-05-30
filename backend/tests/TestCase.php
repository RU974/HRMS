<?php

namespace Tests;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Ensure database migrations are run before seeding
        if (!\Schema::hasTable('permissions')) {
            $this->artisan('migrate', ['--force' => true]);
        }

        // Ensure permissions and roles exist for authorization tests
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
    }

    protected function createUserWithRole(string $roleName, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $role = Role::where('name', $roleName)->whereNull('company_id')->firstOrFail();
        $user->syncRoles([$role]);

        return $user->refresh();
    }
}

