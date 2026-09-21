<?php

namespace Tests;

use App\Models\Company;
use App\Models\License;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\RolePermissionSeeder;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $usesRefreshDatabase = in_array(
            RefreshDatabase::class,
            class_uses_recursive(static::class),
            true,
        );

        // Ensure database migrations are run before seeding for non-refresh tests.
        if (!$usesRefreshDatabase && !\Schema::hasTable('permissions')) {
            $this->artisan('migrate', ['--force' => true]);
        }

        // Ensure permissions and roles exist for authorization tests
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
        $this->seed(RolePermissionSeeder::class);
    }

    protected function createUserWithRole(string $roleName, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        $role = Role::where('name', $roleName)->whereNull('company_id')->firstOrFail();
        $user->syncRoles([$role]);

        return $user->refresh();
    }

    /**
     * Give a company an active license so license-gated routes are reachable.
     */
    protected function grantLicense(Company $company, array $features = ['communication']): void
    {
        License::create([
            'company_id' => $company->id,
            'license_key' => License::generateKey(),
            'product' => 'HRMS',
            'edition' => 'professional',
            'licensee_name' => $company->name,
            'licensee_email' => 'license@example.test',
            'status' => 'active',
            'activated_at' => now(),
            'is_active' => true,
            'features' => $features,
        ]);
    }
}
