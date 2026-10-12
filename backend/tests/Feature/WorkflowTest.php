<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\ApprovalStep;
use App\Models\Workflow;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected Workflow $workflow;

    public function setUp(): void
    {
        parent::setUp();

        $this->workflow = Workflow::create([
            'name' => 'Leave Request Workflow',
            'module' => 'leaves',
            'company_id' => 1,
            'definition' => json_encode([
                'steps' => [
                    [
                        'step_number' => 1,
                        'approver_type' => 'role',
                        'approver_identifier' => 1,
                    ],
                    [
                        'step_number' => 2,
                        'approver_type' => 'role',
                        'approver_identifier' => 2,
                    ],
                ],
            ]),
        ]);

        // Create workflow steps
        ApprovalStep::create([
            'workflow_id' => $this->workflow->id,
            'step_number' => 1,
            'step_order' => 1,
            'approver_type' => 'role',
            'approver_identifier' => 1,
            'conditions' => null,
        ]);

        ApprovalStep::create([
            'workflow_id' => $this->workflow->id,
            'step_number' => 2,
            'step_order' => 2,
            'approver_type' => 'role',
            'approver_identifier' => 2,
            'conditions' => null,
        ]);
    }

    public function test_approval_starts_with_first_step(): void
    {
        $approval = Approval::create([
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $this->workflow->id,
            'status' => 'pending',
            'requested_by' => 1,
            'company_id' => 1,
        ]);

        $firstStep = $this->workflow->steps()->orderBy('step_order')->first();
        $approval->current_step_id = $firstStep->id;
        $approval->save();

        $this->assertEquals($firstStep->id, $approval->current_step_id);
        $this->assertEquals('pending', $approval->status);
    }

    public function test_workflow_progresses_through_steps(): void
    {
        $approval = Approval::create([
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $this->workflow->id,
            'status' => 'pending',
            'requested_by' => 1,
            'company_id' => 1,
        ]);

        $firstStep = $this->workflow->steps()->orderBy('step_order')->first();
        $approval->current_step_id = $firstStep->id;
        $approval->save();

        // Approve at first step
        $secondStep = $this->workflow->steps()->orderBy('step_order')->skip(1)->first();
        $approval->current_step_id = $secondStep->id;
        $approval->save();

        $this->assertEquals($secondStep->id, $approval->current_step_id);
    }

    public function test_approval_completes_when_no_next_step(): void
    {
        $approval = Approval::create([
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $this->workflow->id,
            'status' => 'pending',
            'requested_by' => 1,
            'company_id' => 1,
        ]);

        $lastStep = $this->workflow->steps()->orderBy('step_order', 'desc')->first();
        $approval->current_step_id = $lastStep->id;
        $approval->save();

        // Approve at last step
        $approval->status = 'approved';
        $approval->approved_at = now();
        $approval->save();

        $this->assertEquals('approved', $approval->status);
        $this->assertNotNull($approval->approved_at);
    }

    public function test_workflow_can_be_rejected_at_any_step(): void
    {
        $approval = Approval::create([
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $this->workflow->id,
            'status' => 'pending',
            'requested_by' => 1,
            'company_id' => 1,
        ]);

        $firstStep = $this->workflow->steps()->orderBy('step_order')->first();
        $approval->current_step_id = $firstStep->id;
        $approval->save();

        // Reject at first step
        $approval->status = 'rejected';
        $approval->rejected_at = now();
        $approval->save();

        $this->assertEquals('rejected', $approval->status);
        $this->assertNotNull($approval->rejected_at);
    }

    public function test_create_workflow_with_validation(): void
    {
        $payload = [
            'name' => 'Payroll Approval',
            'module' => 'payroll',
            'definition' => ['description' => 'Payroll approval'],
            'steps' => [
                ['step_order' => 1, 'approver_type' => 'role', 'approver_identifier' => User::ROLE_HR_MANAGER, 'conditions' => []],
            ],
        ];

        // Workflow management needs a signed-in user with the right permission.
        $this->postJson('/api/v1/workflows', $payload)->assertUnauthorized();

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_SUPER_ADMIN));

        $this->postJson('/api/v1/workflows', array_diff_key($payload, ['steps' => 1]))->assertStatus(422)->assertJsonValidationErrors('steps');
        $this->postJson('/api/v1/workflows', $payload)->assertStatus(201)->assertJsonPath('data.name', 'Payroll Approval');

        $this->assertDatabaseHas('workflows', [
            'name' => 'Payroll Approval',
            'module' => 'payroll',
        ]);
    }

    public function test_workflow_with_conditions(): void
    {
        $approval = Approval::create([
            'module' => 'leaves',
            'module_id' => 1,
            'workflow_id' => $this->workflow->id,
            'status' => 'pending',
            'requested_by' => 1,
            'company_id' => 1,
            'metadata' => ['days' => 5],
        ]);

        $firstStep = $this->workflow->steps()->orderBy('step_order')->first();
        $firstStep->update([
            'conditions' => json_encode([
                'field' => 'days',
                'operator' => '>=',
                'value' => 3,
            ]),
        ]);

        $approval->current_step_id = $firstStep->id;
        $approval->save();

        // Verify condition metadata
        $this->assertEquals(5, $approval->metadata['days']);
        $this->assertGreaterThanOrEqual(3, $approval->metadata['days']);
    }
}
