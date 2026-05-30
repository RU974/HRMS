<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserRoleAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_creation_assigns_the_selected_role_and_permissions(): void
    {
        $department = Department::create([
            'name' => 'Operations',
        ]);

        $permission = Permission::firstOrCreate([
            'module' => 'user',
            'action' => 'manage',
        ], [
            'description' => 'User manage',
        ]);

        $employeeRole = Role::firstOrCreate([
            'company_id' => null,
            'name' => User::ROLE_EMPLOYEE,
        ], [
            'description' => 'Employee role',
            'guard_name' => 'web',
            'is_system' => true,
        ]);
        $employeeRole->permissions()->sync([$permission->id]);

        $manager = $this->createUserWithRole(User::ROLE_HR_MANAGER, [
            'name' => 'Manager User',
            'email' => 'manager@example.com',
        ]);

        Sanctum::actingAs($manager);

        $createResponse = $this->postJson('/api/v1/employees', [
            'name' => 'Employee User',
            'email' => 'employee@example.com',
            'password' => 'password123',
            'department_id' => $department->id,
            'salary' => 2500,
            'role' => User::ROLE_EMPLOYEE,
        ]);

        $createResponse
            ->assertCreated()
            ->assertJsonPath('success', true);

        $employeeUser = User::query()
            ->where('email', 'employee@example.com')
            ->with('roles.permissions')
            ->firstOrFail();

        $this->assertSame([User::ROLE_EMPLOYEE], $employeeUser->roles->pluck('name')->all());
        $this->assertTrue($employeeUser->hasPermission('user.manage'));

        Sanctum::actingAs($employeeUser);

        $permissionsResponse = $this->getJson('/api/v1/me/permissions')
            ->assertOk();

        $permissions = $permissionsResponse->json('data.permissions');
        $this->assertTrue(
            in_array('manage users', $permissions, true) || in_array('user.manage', $permissions, true)
        );
    }
}
