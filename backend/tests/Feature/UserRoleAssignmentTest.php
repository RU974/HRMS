<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
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

    public function test_user_management_allows_manage_users_permission_to_assign_roles(): void
    {
        $permission = Permission::firstOrCreate([
            'module' => 'user',
            'action' => 'manage',
        ], [
            'description' => 'Manage users',
        ]);

        $manageUsersRole = Role::firstOrCreate([
            'company_id' => null,
            'name' => 'User Manager',
        ], [
            'description' => 'User manager role',
            'guard_name' => 'web',
            'is_system' => false,
        ]);
        $manageUsersRole->permissions()->sync([$permission->id]);

        $employeeRole = Role::firstOrCreate([
            'company_id' => null,
            'name' => User::ROLE_EMPLOYEE,
        ], [
            'description' => 'Employee role',
            'guard_name' => 'web',
            'is_system' => true,
        ]);

        $actor = $this->createUserWithRole('User Manager', [
            'name' => 'Actor User',
            'email' => 'actor.user@example.com',
        ]);

        Sanctum::actingAs($actor);

        $payload = [
            'name' => 'New Managed User',
            'email' => 'newmanageduser@example.com',
            'password' => 'password123',
            'role_ids' => [$employeeRole->id],
        ];

        $response = $this->postJson('/api/v1/settings/users', $payload);

        $response->assertCreated()->assertJsonPath('success', true);

        $newUser = User::where('email', 'newmanageduser@example.com')->firstOrFail()->load('roles');
        $this->assertTrue($newUser->roles->contains(fn ($role) => $role->id === $employeeRole->id));
    }

    public function test_user_management_updates_keep_existing_roles_when_only_password_changes(): void
    {
        $employeeRole = Role::firstOrCreate([
            'company_id' => null,
            'name' => User::ROLE_EMPLOYEE,
        ], [
            'description' => 'Employee role',
            'guard_name' => 'web',
            'is_system' => true,
        ]);

        $actor = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'name' => 'Admin User',
            'email' => 'admin.update@example.com',
        ]);

        $targetUser = User::factory()->create([
            'name' => 'Editable User',
            'email' => 'editable@example.com',
        ]);
        $targetUser->syncRoles([$employeeRole]);

        Sanctum::actingAs($actor);

        $response = $this->putJson('/api/v1/settings/users/' . $targetUser->id, [
            'name' => 'Editable User',
            'email' => 'editable.updated@example.com',
            'password' => 'new-password123',
            'company_id' => null,
            'branch_id' => null,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.role_ids.0', $employeeRole->id);

        $targetUser->refresh()->load('roles');

        $this->assertSame([User::ROLE_EMPLOYEE], $targetUser->roles->pluck('name')->values()->all());
    }

    public function test_employee_password_updates_do_not_clear_the_linked_role(): void
    {
        $department = Department::create([
            'name' => 'Operations',
        ]);

        $employeeRole = Role::firstOrCreate([
            'company_id' => null,
            'name' => User::ROLE_EMPLOYEE,
        ], [
            'description' => 'Employee role',
            'guard_name' => 'web',
            'is_system' => true,
        ]);

        $actor = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'name' => 'Admin User',
            'email' => 'admin.employee@example.com',
        ]);

        $employeeUser = User::factory()->create([
            'name' => 'Employee User',
            'email' => 'employee.user@example.com',
        ]);
        $employeeUser->syncRoles([$employeeRole]);

        $employee = Employee::create([
            'user_id' => $employeeUser->id,
            'name' => 'Employee User',
            'email' => 'employee.user@example.com',
            'department_id' => $department->id,
            'designation' => 'Employee',
            'salary' => 2500,
        ]);

        Sanctum::actingAs($actor);

        $response = $this->postJson('/api/v1/employees/' . $employee->id . '/set-password', [
            'password' => 'new-password123',
            'password_confirmation' => 'new-password123',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true);

        $employeeUser->refresh()->load('roles');

        $this->assertSame([User::ROLE_EMPLOYEE], $employeeUser->roles->pluck('name')->values()->all());
    }
}
