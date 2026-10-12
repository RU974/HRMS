<?php

namespace Tests\Feature;

use App\Models\Approval;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentRequisitionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hrManager;

    private User $deptManager;

    private Department $department;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment', 'approvals']);
        $this->department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $this->deptManager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $this->company->id]);
    }

    private function enforce(): void
    {
        $this->company->update(['requisition_approval_required' => true]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Senior Backend Engineer',
            'department_id' => $this->department->id,
            'open_positions' => 2,
            'justification' => 'Team is growing.',
        ], $overrides);
    }

    public function test_jobs_publish_directly_while_approval_is_not_enforced(): void
    {
        Sanctum::actingAs($this->recruiter);

        $this->postJson('/api/v1/job-openings', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.status', 'open');
    }

    public function test_recruiter_job_goes_through_approval_when_enforced(): void
    {
        $this->enforce();
        Sanctum::actingAs($this->recruiter);

        $id = $this->postJson('/api/v1/job-openings', $this->payload(['status' => 'open', 'is_public' => true]))
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending_approval')
            ->assertJsonPath('data.requested_by', $this->recruiter->id)
            ->json('data.id');

        $this->assertSame(1, Approval::where('module', 'recruitment_job_requisition')->where('module_id', $id)->where('status', 'pending')->count());
        $this->assertTrue(NotificationItem::where('user_id', $this->hrManager->id)->where('type', 'recruitment_requisition')->exists());

        // A pending job accepts no candidates, cannot be edited, and is not published.
        $this->postJson('/api/v1/candidates', ['job_opening_id' => $id, 'full_name' => 'A B', 'email' => 'ab@example.com'])
            ->assertStatus(422)->assertJsonValidationErrors('job_opening_id');
        $this->putJson("/api/v1/job-openings/{$id}", ['title' => 'Changed'])->assertStatus(422);

        // The requester cannot approve their own request.
        $this->postJson("/api/v1/job-openings/{$id}/approve")->assertForbidden();

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$id}/approve", ['notes' => 'Budget ok'])
            ->assertOk()
            ->assertJsonPath('data.status', 'open');

        $job = JobOpening::findOrFail($id);
        $this->assertNotNull($job->posted_at);
        $this->assertTrue(NotificationItem::where('user_id', $this->recruiter->id)->where('title', 'like', 'Job requisition approved%')->exists());

        Sanctum::actingAs($this->recruiter);
        $this->postJson('/api/v1/candidates', ['job_opening_id' => $id, 'full_name' => 'A B', 'email' => 'ab@example.com'])->assertCreated();
    }

    public function test_rejection_requires_a_note_and_the_requester_can_fix_and_resubmit(): void
    {
        $this->enforce();
        Sanctum::actingAs($this->recruiter);
        $id = $this->postJson('/api/v1/job-openings', $this->payload())->assertCreated()->json('data.id');

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$id}/reject")->assertStatus(422)->assertJsonValidationErrors('notes');
        $this->postJson("/api/v1/job-openings/{$id}/reject", ['notes' => 'No budget this quarter'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.approval_note', 'No budget this quarter');

        Sanctum::actingAs($this->recruiter);
        // Editing is allowed but the job cannot be forced open while approval is enforced.
        $this->putJson("/api/v1/job-openings/{$id}", ['title' => 'Backend Engineer II'])->assertOk();
        $this->putJson("/api/v1/job-openings/{$id}", ['status' => 'open'])->assertStatus(422);

        $this->postJson("/api/v1/job-openings/{$id}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_approval');

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/job-openings/{$id}/approve")->assertOk()->assertJsonPath('data.status', 'open');
    }

    public function test_approving_through_the_generic_approval_engine_opens_the_job(): void
    {
        $this->enforce();
        Sanctum::actingAs($this->recruiter);
        $id = $this->postJson('/api/v1/job-openings', $this->payload())->assertCreated()->json('data.id');

        $approval = Approval::where('module', 'recruitment_job_requisition')->where('module_id', $id)->firstOrFail();

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/approvals/{$approval->id}/approve")->assertOk();

        $this->assertSame('open', JobOpening::findOrFail($id)->status);
    }

    public function test_department_manager_can_raise_requisition_but_has_no_other_recruitment_access(): void
    {
        Sanctum::actingAs($this->deptManager);

        $this->getJson('/api/v1/job-openings')->assertForbidden();
        $this->getJson('/api/v1/candidates')->assertForbidden();

        // Even with approval not enforced company-wide, a requester's job must be approved.
        $id = $this->postJson('/api/v1/requisitions', $this->payload(['status' => 'open']))
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending_approval')
            ->json('data.id');

        $this->getJson('/api/v1/requisitions')->assertOk()->assertJsonCount(1, 'data.data');

        // The department picker works without access to the full department list, and is company scoped.
        $this->getJson('/api/v1/departments')->assertForbidden();
        Department::create(['name' => 'Foreign department', 'company_id' => Company::create(['name' => 'Elsewhere'])->id]);
        $this->getJson('/api/v1/requisitions/departments')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Engineering');

        // Cannot approve their own, cannot touch someone else's.
        $this->postJson("/api/v1/job-openings/{$id}/approve")->assertForbidden();
        $other = JobOpening::create(['title' => 'Other', 'company_id' => $this->company->id, 'status' => 'rejected', 'requested_by' => $this->recruiter->id, 'open_positions' => 1, 'employment_type' => 'full_time']);
        $this->postJson("/api/v1/requisitions/{$other->id}/submit")->assertForbidden();
        $this->putJson("/api/v1/requisitions/{$other->id}", ['title' => 'Hijack'])->assertForbidden();

        // Withdraw, edit, resubmit.
        $this->postJson("/api/v1/requisitions/{$id}/withdraw")->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->putJson("/api/v1/requisitions/{$id}", ['title' => 'Revised title'])->assertOk()->assertJsonPath('data.title', 'Revised title');
        $this->postJson("/api/v1/requisitions/{$id}/submit")->assertOk()->assertJsonPath('data.status', 'pending_approval');
        // Pending requisitions cannot be edited via the requester endpoint either.
        $this->putJson("/api/v1/requisitions/{$id}", ['title' => 'Nope'])->assertStatus(422);
    }

    public function test_employee_cannot_raise_requisitions_and_other_companies_are_isolated(): void
    {
        $employee = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        Sanctum::actingAs($employee);
        $this->postJson('/api/v1/requisitions', $this->payload())->assertForbidden();

        $this->enforce();
        Sanctum::actingAs($this->recruiter);
        $id = $this->postJson('/api/v1/job-openings', $this->payload())->assertCreated()->json('data.id');

        $otherCompany = Company::create(['name' => 'Other Co']);
        $this->grantLicense($otherCompany, ['recruitment']);
        $otherHr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $otherCompany->id]);
        Sanctum::actingAs($otherHr);
        $this->postJson("/api/v1/job-openings/{$id}/approve")->assertForbidden();
    }

    public function test_deleting_a_pending_requisition_cancels_its_approval(): void
    {
        $this->enforce();
        Sanctum::actingAs($this->recruiter);
        $id = $this->postJson('/api/v1/job-openings', $this->payload())->assertCreated()->json('data.id');
        $approval = Approval::where('module', 'recruitment_job_requisition')->where('module_id', $id)->firstOrFail();

        $this->deleteJson("/api/v1/job-openings/{$id}")->assertOk();

        $this->assertSame('rejected', $approval->fresh()->status);
        $this->assertNull(JobOpening::find($id));
    }

    public function test_enforcement_is_switched_from_recruitment_settings(): void
    {
        // Only users who manage recruitment settings (Recruiter role) may change it.
        Sanctum::actingAs($this->hrManager);
        $this->putJson('/api/v1/recruitment/careers-settings', ['requisition_approval_required' => true])->assertForbidden();

        Sanctum::actingAs($this->recruiter);

        $this->putJson('/api/v1/recruitment/careers-settings', ['requisition_approval_required' => true])
            ->assertOk()
            ->assertJsonPath('data.requisition_approval_required', true);

        $this->assertTrue($this->company->fresh()->requisition_approval_required);
        $this->getJson('/api/v1/recruitment/careers-settings')->assertJsonPath('data.requisition_approval_required', true);
    }
}
