<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_has_all_permissions_without_explicit_assignments(): void
    {
        $superAdminRole = Role::firstOrCreate([
            'company_id' => null,
            'name' => User::ROLE_SUPER_ADMIN,
        ], [
            'description' => 'Super admin role',
            'guard_name' => 'web',
            'is_system' => true,
        ]);

        $user = User::factory()->create([
            'name' => 'Super Admin Without Permissions',
            'email' => 'superadmin.no.permissions@example.com',
        ]);

        $user->syncRoles([$superAdminRole]);
        $superAdminRole->permissions()->detach();

        $permissionService = app(PermissionService::class);

        $this->assertTrue($permissionService->hasPermission($user, 'users:create'));
        $this->assertTrue($permissionService->hasPermission($user, 'approvals:manage'));
        $this->assertTrue($user->hasPermission('any.random.permission'));
    }
}
