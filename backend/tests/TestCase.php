<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
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
}


