<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\ApprovalStep;
use App\Models\Company;
use App\Models\User;
use App\Models\Workflow;
use App\Services\WorkflowEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Role-based access to approvals and workflow management, using the seeded system roles. */
class RBACTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $superAdmin;

    private User $hrManager;

    private User $employee;

    public function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'RBAC Co']);
        $this->grantLicense($this->company, ['approvals']);

        $this->superAdmin = $this->createUserWithRole(User::ROLE_SUPER_ADMIN);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $this->employee = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
    }

    /** A pending approval whose only step is for HR Managers. */
    private function hrApproval(): Approval
    {
        $workflow = Workflow::create(['name' => 'Leave', 'module' => 'leaves', 'company_id' => $this->company->id, 'definition' => ['description' => 'x']]);
        ApprovalStep::create([
            'workflow_id' => $workflow->id, 'step_order' => 1, 'approver_type' => 'role',
            'approver_identifier' => User::ROLE_HR_MANAGER, 'conditions' => [], 'required_approvals' => 1,
        ]);

        return (new WorkflowEngine())->startWorkflow('leaves', 1, $workflow, $this->employee->id);
    }

    public function test_super_admin_can_access_all_approvals(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $this->getJson('/api/v1/approvals')->assertOk();
    }

    public function test_hr_managers_and_employees_can_view_approvals(): void
    {
        Sanctum::actingAs($this->hrManager);
        $this->getJson('/api/v1/approvals')->assertOk();

        Sanctum::actingAs($this->employee);
        $this->getJson('/api/v1/approvals')->assertOk();
    }

    public function test_users_from_another_company_cannot_see_the_approval(): void
    {
        $approval = $this->hrApproval();
        $other = Company::create(['name' => 'Other Co']);
        $this->grantLicense($other, ['approvals']);

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $other->id]));

        $this->assertCount(0, $this->getJson('/api/v1/approvals')->assertOk()->json('data'));
        $this->postJson("/api/v1/approvals/{$approval->id}/approve")->assertNotFound();
    }

    public function test_employee_cannot_approve_approvals(): void
    {
        $approval = $this->hrApproval();

        Sanctum::actingAs($this->employee);

        $this->postJson("/api/v1/approvals/{$approval->id}/approve")->assertForbidden();
        $this->assertSame('pending', $approval->fresh()->status);
    }

    public function test_hr_manager_can_approve_an_approval_waiting_for_their_role(): void
    {
        $approval = $this->hrApproval();

        Sanctum::actingAs($this->hrManager);

        $this->postJson("/api/v1/approvals/{$approval->id}/approve", ['notes' => 'Approved'])->assertOk();
        $this->assertSame('approved', $approval->fresh()->status);
    }

    public function test_user_without_permission_cannot_manage_workflows(): void
    {
        Sanctum::actingAs($this->employee);

        $this->postJson('/api/v1/workflows', $this->workflowPayload())->assertForbidden();
    }

    public function test_admin_and_hr_manager_can_manage_workflows(): void
    {
        Sanctum::actingAs($this->superAdmin);
        $this->postJson('/api/v1/workflows', $this->workflowPayload())->assertCreated();

        Sanctum::actingAs($this->hrManager);
        $this->postJson('/api/v1/workflows', $this->workflowPayload('Second'))->assertCreated();
    }

    public function test_role_permission_inheritance(): void
    {
        $this->assertTrue($this->hrManager->hasPermission('approvals:view'));
        $this->assertTrue($this->hrManager->hasPermission('approvals:approve'));
        $this->assertFalse($this->hrManager->hasPermission('users:create'));
        $this->assertFalse($this->employee->hasPermission('approvals:approve'));
    }

    private function workflowPayload(string $name = 'Leave Request Workflow'): array
    {
        return [
            'name' => $name,
            'module' => 'leaves',
            'definition' => ['description' => 'Leave approval'],
            'steps' => [['step_order' => 1, 'approver_type' => 'role', 'approver_identifier' => User::ROLE_HR_MANAGER, 'conditions' => []]],
        ];
    }
}
