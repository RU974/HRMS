<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\Company;
use App\Models\Workflow;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApprovalWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_create_workflow_and_start_and_approve_an_approval(): void
    {
        $user = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'name' => 'Super Admin',
            'email' => 'super-admin@example.com',
        ]);

        Sanctum::actingAs($user);

        $company = Company::create(['name' => 'Company Test']);

        $workflowResponse = $this->postJson('/api/v1/workflows', [
            'name' => 'Leave Approval Workflow',
            'module' => 'leaves',
            'definition' => ['description' => 'Leave approval workflow'],
            'steps' => [
                [
                    'step_order' => 1,
                    'approver_type' => 'role',
                    'approver_identifier' => User::ROLE_HR_MANAGER,
                    'conditions' => [],
                ],
            ],
        ]);

        $workflowResponse->assertCreated()
            ->assertJsonPath('data.name', 'Leave Approval Workflow')
            ->assertJsonCount(1, 'data.steps');

        $workflowId = $workflowResponse->json('data.id');
        $stepId = $workflowResponse->json('data.steps.0.id');

        $approvalResponse = $this->postJson('/api/v1/approvals', [
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $workflowId,
            'metadata' => ['requested_days' => 3],
        ]);

        $approvalResponse->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.current_step_id', $stepId)
            ->assertJsonPath('data.workflow.id', $workflowId);

        $approvalId = $approvalResponse->json('data.id');

        $approveResponse = $this->postJson("/api/v1/approvals/{$approvalId}/approve", [
            'notes' => 'Approved for first step',
        ]);

        $approveResponse->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.id', $approvalId);
    }

    public function test_company_scoped_approvals_are_visible_only_to_same_company_users(): void
    {
        $companyA = Company::create(['name' => 'Company A']);
        $this->grantLicense($companyA, ["approvals"]);
        $companyB = Company::create(['name' => 'Company B']);

        $companyAdmin = $this->createUserWithRole(User::ROLE_SUPER_ADMIN, [
            'name' => 'Company A Admin',
            'email' => 'company-a-admin@example.com',
            'company_id' => $companyA->id,
        ]);

        $workflowA = Workflow::create([
            'name' => 'Company A Workflow',
            'module' => 'leaves',
            'definition' => ['description' => 'A workflow'],
            'company_id' => $companyA->id,
        ]);

        $workflowB = Workflow::create([
            'name' => 'Company B Workflow',
            'module' => 'leaves',
            'definition' => ['description' => 'B workflow'],
            'company_id' => $companyB->id,
        ]);

        $approvalA = Approval::create([
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $workflowA->id,
            'current_step_id' => null,
            'status' => 'pending',
            'requested_by' => $companyAdmin->id,
            'company_id' => $companyA->id,
        ]);

        Approval::create([
            'module' => 'leaves',
            'module_id' => 2,
            'workflow_id' => $workflowB->id,
            'current_step_id' => null,
            'status' => 'pending',
            'requested_by' => $companyAdmin->id,
            'company_id' => $companyB->id,
        ]);

        Sanctum::actingAs($companyAdmin);

        $this->getJson('/api/v1/approvals')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $approvalA->id);

        $this->getJson('/api/v1/approvals/' . $approvalA->id)
            ->assertOk()
            ->assertJsonPath('data.id', $approvalA->id);

        $this->getJson('/api/v1/approvals/' . ($approvalA->id + 1))
            ->assertNotFound();
    }
}
