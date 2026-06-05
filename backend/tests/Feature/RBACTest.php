<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\Role;
use App\Models\User;
use App\Models\Workflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RBACTest extends TestCase
{
    use RefreshDatabase;

    protected User $adminUser;
    protected User $hrManagerUser;
    protected User $employeeUser;
    protected Role $adminRole;
    protected Role $hrManagerRole;
    protected Role $employeeRole;

    public function setUp(): void
    {
        parent::setUp();

        // Create roles
        $this->adminRole = Role::create(['name' => 'Super Admin', 'company_id' => 1]);
        $this->hrManagerRole = Role::create(['name' => 'HR Manager', 'company_id' => 1]);
        $this->employeeRole = Role::create(['name' => 'Employee', 'company_id' => 1]);

        // Create permissions and assign to roles
        $this->setupPermissions();

        // Create users with roles
        $this->adminUser = User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => bcrypt('password'),
            'company_id' => 1,
            'role_id' => $this->adminRole->id,
        ]);

        $this->hrManagerUser = User::create([
            'name' => 'HR Manager',
            'email' => 'hr@example.com',
            'password' => bcrypt('password'),
            'company_id' => 1,
            'role_id' => $this->hrManagerRole->id,
        ]);

        $this->employeeUser = User::create([
            'name' => 'Employee User',
            'email' => 'employee@example.com',
            'password' => bcrypt('password'),
            'company_id' => 1,
            'role_id' => $this->employeeRole->id,
        ]);
    }

    private function setupPermissions(): void
    {
        // Create permissions
        $permissions = [
            'approvals:view',
            'approvals:approve',
            'approvals:manage_settings',
            'users:view',
            'users:create',
            'users:edit',
        ];

        $createdPermissions = [];
        foreach ($permissions as $permission) {
            $createdPermissions[$permission] = \App\Models\Permission::create(['name' => $permission, 'company_id' => 1]);
        }

        // Assign all permissions to admin
        $this->adminRole->permissions()->sync(array_values($createdPermissions));

        // Assign limited permissions to HR Manager
        $this->hrManagerRole->permissions()->sync([
            $createdPermissions['approvals:view']->id,
            $createdPermissions['approvals:approve']->id,
            $createdPermissions['users:view']->id,
        ]);

        // Assign minimal permissions to Employee
        $this->employeeRole->permissions()->sync([
            $createdPermissions['approvals:view']->id,
        ]);
    }

    public function test_super_admin_can_access_all_approvals(): void
    {
        $response = $this->actingAs($this->adminUser)
            ->getJson('/api/v1/approvals');

        $response->assertStatus(200);
    }

    public function test_hr_manager_can_view_approvals(): void
    {
        $response = $this->actingAs($this->hrManagerUser)
            ->getJson('/api/v1/approvals');

        $response->assertStatus(200);
    }

    public function test_employee_can_view_approvals(): void
    {
        $response = $this->actingAs($this->employeeUser)
            ->getJson('/api/v1/approvals');

        $response->assertStatus(200);
    }

    public function test_employee_cannot_approve_approvals(): void
    {
        $approval = Approval::factory()->create(['company_id' => 1]);

        $response = $this->actingAs($this->employeeUser)
            ->postJson("/api/v1/approvals/{$approval->id}/approve");

        $response->assertStatus(403);
    }

    public function test_hr_manager_can_approve_approvals(): void
    {
        $approval = Approval::factory()->create(['company_id' => 1]);

        $response = $this->actingAs($this->hrManagerUser)
            ->postJson("/api/v1/approvals/{$approval->id}/approve", ['notes' => 'Approved']);

        $response->assertStatus(200);
    }

    public function test_user_without_permission_cannot_manage_workflows(): void
    {
        $response = $this->actingAs($this->employeeUser)
            ->postJson('/api/v1/workflows', [
                'name' => 'Test Workflow',
                'module' => 'leaves',
                'definition' => [],
            ]);

        $response->assertStatus(403);
    }

    public function test_admin_can_manage_workflows(): void
    {
        $response = $this->actingAs($this->adminUser)
            ->postJson('/api/v1/workflows', [
                'name' => 'Leave Request Workflow',
                'module' => 'leaves',
                'definition' => [],
            ]);

        $response->assertStatus(201);
    }

    public function test_role_permission_inheritance(): void
    {
        $this->assertTrue($this->hrManagerUser->hasPermission('approvals:view'));
        $this->assertTrue($this->hrManagerUser->hasPermission('approvals:approve'));
        $this->assertFalse($this->hrManagerUser->hasPermission('users:create'));
        $this->assertFalse($this->employeeUser->hasPermission('approvals:approve'));
    }
}
