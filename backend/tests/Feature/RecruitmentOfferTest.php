<?php

namespace Tests\Feature;

use App\Events\ApprovalApproved;
use App\Models\Approval;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\JobOpening;
use App\Models\NotificationItem;
use App\Models\Offer;
use App\Models\User;
use App\Models\Workflow;
use App\Services\ApprovalEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentOfferTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hrManager;

    private Candidate $candidate;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 2,
        ]);
        $this->candidate = Candidate::create([
            'job_opening_id' => $job->id, 'company_id' => $this->company->id,
            'full_name' => 'Ali Khan', 'email' => 'ali@example.com', 'stage' => 'interview',
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function createOffer(array $overrides = []): int
    {
        return $this->postJson('/api/v1/offers', array_merge([
            'candidate_id' => $this->candidate->id,
            'salary' => 150000,
            'currency' => 'PKR',
            'start_date' => '2026-12-01',
            'benefits' => ['Health insurance', 'Annual bonus'],
            'terms' => 'Probation of three months.',
        ], $overrides))->assertCreated()->json('data.id');
    }

    private function approvedOffer(): int
    {
        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();
        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/offers/{$id}/approve")->assertOk();
        Sanctum::actingAs($this->recruiter);

        return $id;
    }

    // ---- creation --------------------------------------------------------------

    public function test_offer_validation_stage_rules_and_single_active_offer(): void
    {
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id])->assertStatus(422)->assertJsonValidationErrors('salary');
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 0])->assertStatus(422);
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 100, 'expires_at' => '2020-01-01'])->assertStatus(422);

        $this->candidate->update(['stage' => 'applied']);
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 100])
            ->assertStatus(422)->assertJsonValidationErrors('candidate_id');

        $this->candidate->update(['stage' => 'interview']);
        $this->createOffer();
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 100])
            ->assertStatus(422)->assertJsonValidationErrors('candidate_id');
    }

    public function test_drafts_can_be_edited_but_other_statuses_cannot(): void
    {
        $id = $this->createOffer();
        $this->putJson("/api/v1/offers/{$id}", ['salary' => 160000])->assertOk()->assertJsonPath('data.salary', '160000.00');

        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();
        $this->putJson("/api/v1/offers/{$id}", ['salary' => 1])->assertStatus(422);
    }

    public function test_submitting_requires_a_start_date(): void
    {
        $id = $this->createOffer(['start_date' => null]);

        $this->postJson("/api/v1/offers/{$id}/submit")->assertStatus(422)->assertJsonValidationErrors('start_date');
    }

    // ---- approval --------------------------------------------------------------

    public function test_full_offer_lifecycle_ends_in_a_hire_using_the_offer_terms(): void
    {
        $id = $this->createOffer();

        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk()->assertJsonPath('data.status', 'pending_approval');
        $approval = Approval::where('module', 'recruitment_offer')->where('module_id', $id)->firstOrFail();
        $this->assertSame('pending', $approval->status);
        $this->assertSame($this->company->id, $approval->company_id);
        $this->assertNotNull(NotificationItem::where('user_id', $this->hrManager->id)->where('type', 'recruitment_offer')->first());

        $this->postJson("/api/v1/offers/{$id}/send")->assertStatus(422); // not approved yet

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/offers/{$id}/approve", ['notes' => 'Within band'])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertSame('approved', $approval->fresh()->status);
        $this->assertNotNull(NotificationItem::where('user_id', $this->recruiter->id)->where('title', 'like', 'Offer approved%')->first());

        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/offers/{$id}/send")->assertOk()->assertJsonPath('data.status', 'sent');
        $this->assertSame('offer', $this->candidate->fresh()->stage); // moved from interview automatically

        $this->postJson("/api/v1/offers/{$id}/respond", ['response' => 'accepted'])->assertOk()->assertJsonPath('data.status', 'accepted');

        $this->postJson("/api/v1/candidates/{$this->candidate->id}/hire")->assertOk()
            ->assertJsonPath('data.candidate.stage', 'hired');

        $employee = Employee::where('email', 'ali@example.com')->firstOrFail();
        $this->assertEquals(150000, $employee->salary);
        $this->assertSame('2026-12-01', $employee->joining_date instanceof \DateTimeInterface ? $employee->joining_date->format('Y-m-d') : substr((string) $employee->joining_date, 0, 10));
    }

    public function test_rejection_needs_a_note_returns_the_offer_to_editing_and_can_be_resubmitted(): void
    {
        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/offers/{$id}/reject")->assertStatus(422)->assertJsonValidationErrors('notes');
        $this->postJson("/api/v1/offers/{$id}/reject", ['notes' => 'Salary above band'])
            ->assertOk()->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.approval_note', 'Salary above band');

        Sanctum::actingAs($this->recruiter);
        $this->putJson("/api/v1/offers/{$id}", ['salary' => 120000])->assertOk();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk()->assertJsonPath('data.status', 'pending_approval');
        $this->assertSame(2, Approval::where('module', 'recruitment_offer')->where('module_id', $id)->count());
    }

    public function test_only_eligible_non_requesters_can_decide(): void
    {
        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();

        // Recruiters have no approvals:approve permission.
        $this->postJson("/api/v1/offers/{$id}/approve")->assertForbidden();

        // An HR Manager who submitted the offer cannot approve their own request.
        Sanctum::actingAs($this->hrManager);
        $ownId = $this->postJson('/api/v1/offers', [
            'candidate_id' => Candidate::create([
                'job_opening_id' => $this->candidate->job_opening_id, 'company_id' => $this->company->id,
                'full_name' => 'Nina', 'email' => 'nina@example.com', 'stage' => 'interview',
            ])->id,
            'salary' => 90000, 'start_date' => '2026-12-05',
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/offers/{$ownId}/submit")->assertOk();
        $this->postJson("/api/v1/offers/{$ownId}/approve")->assertForbidden();

        // A Company Admin can.
        $admin = $this->createUserWithRole(User::ROLE_COMPANY_ADMIN, ['company_id' => $this->company->id]);
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/offers/{$ownId}/approve")->assertOk()->assertJsonPath('data.status', 'approved');

        // An approver from another company cannot touch this offer.
        $other = Company::create(['name' => 'Other']);
        $this->grantLicense($other, ['recruitment']);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $other->id]));
        $this->postJson("/api/v1/offers/{$id}/approve")->assertForbidden();
    }

    public function test_deciding_through_the_generic_approval_engine_updates_the_offer(): void
    {
        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();
        $approval = Approval::where('module', 'recruitment_offer')->where('module_id', $id)->firstOrFail();

        (new ApprovalEngine())->approve($approval->load('currentStep'), $this->hrManager->id, ['notes' => 'ok']);

        $this->assertSame('approved', Offer::findOrFail($id)->status);
    }

    public function test_unrelated_approvals_do_not_touch_offers(): void
    {
        $id = $this->createOffer();
        $workflow = Workflow::create(['name' => 'Leave', 'module' => 'leave']);
        $approval = Approval::create(['module' => 'leave', 'module_id' => $id, 'workflow_id' => $workflow->id, 'status' => 'approved', 'requested_by' => $this->recruiter->id]);

        event(new ApprovalApproved($approval));

        $this->assertSame('draft', Offer::findOrFail($id)->status);
    }

    // ---- acceptance, decline, withdrawal, expiry ---------------------------------

    public function test_hiring_requires_an_accepted_offer_unless_a_settings_manager_skips_it(): void
    {
        $this->candidate->update(['stage' => 'offer']);

        $this->postJson("/api/v1/candidates/{$this->candidate->id}/hire", ['salary' => 1000])
            ->assertStatus(422)->assertJsonValidationErrors('offer');

        Sanctum::actingAs($this->hrManager); // lacks recruitment:manage_settings
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/hire", ['salary' => 1000, 'skip_offer' => true])->assertForbidden();

        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/hire", ['salary' => 1000, 'skip_offer' => true])->assertOk();
    }

    public function test_declined_offers_keep_the_candidate_in_the_offer_stage_and_allow_a_new_offer(): void
    {
        $id = $this->approvedOffer();
        $this->postJson("/api/v1/offers/{$id}/send")->assertOk();

        $this->postJson("/api/v1/offers/{$id}/respond", ['response' => 'declined', 'reason' => 'Took another job'])
            ->assertOk()->assertJsonPath('data.status', 'declined')->assertJsonPath('data.decline_reason', 'Took another job');
        $this->assertSame('offer', $this->candidate->fresh()->stage);
        $this->postJson("/api/v1/offers/{$id}/respond", ['response' => 'accepted'])->assertStatus(422);

        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 170000])->assertCreated();
    }

    public function test_withdrawing_and_rejecting_the_candidate_withdraw_open_offers(): void
    {
        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/withdraw")->assertOk()->assertJsonPath('data.status', 'withdrawn');
        $this->postJson("/api/v1/offers/{$id}/withdraw")->assertStatus(422);

        $second = $this->createOffer();
        $this->postJson("/api/v1/offers/{$second}/submit")->assertOk();
        $approval = Approval::where('module_id', $second)->firstOrFail();

        $this->patchJson("/api/v1/candidates/{$this->candidate->id}/stage", ['stage' => 'rejected', 'reason' => 'Position frozen'])->assertOk();

        $this->assertSame('withdrawn', Offer::findOrFail($second)->status);
        $this->assertSame('rejected', $approval->fresh()->status);
    }

    public function test_sent_offers_expire_after_their_expiry_date(): void
    {
        $offer = Offer::create([
            'company_id' => $this->company->id, 'candidate_id' => $this->candidate->id, 'salary' => 1000, 'status' => 'sent',
            'expires_at' => now()->subDay()->toDateString(), 'created_by' => $this->recruiter->id,
        ]);
        $fresh = Offer::create([
            'company_id' => $this->company->id, 'candidate_id' => $this->candidate->id, 'salary' => 1000, 'status' => 'sent',
            'expires_at' => now()->addDay()->toDateString(), 'created_by' => $this->recruiter->id,
        ]);

        $this->getJson('/api/v1/offers')->assertOk();

        $this->assertSame('expired', $offer->fresh()->status);
        $this->assertSame('sent', $fresh->fresh()->status);
    }

    public function test_deleting_offers_is_limited_to_non_live_statuses(): void
    {
        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();
        $this->deleteJson("/api/v1/offers/{$id}")->assertStatus(422);

        $this->postJson("/api/v1/offers/{$id}/withdraw")->assertOk();
        $this->deleteJson("/api/v1/offers/{$id}")->assertOk();
        $this->assertNull(Offer::find($id));
    }

    // ---- listing, pdf, isolation -------------------------------------------------

    public function test_listing_filters_and_pdf_download(): void
    {
        $id = $this->createOffer();

        $this->getJson('/api/v1/offers?status=draft')->assertOk()->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.candidate.full_name', 'Ali Khan')
            ->assertJsonPath('data.data.0.candidate.job_opening.title', 'Backend Engineer');
        $this->getJson('/api/v1/offers?status=sent')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson('/api/v1/offers?q=nobody')->assertOk()->assertJsonCount(0, 'data.data');

        $pdf = $this->get("/api/v1/offers/{$id}/pdf")->assertOk();
        $this->assertStringContainsString('application/pdf', $pdf->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
    }

    public function test_offers_are_isolated_between_companies(): void
    {
        $id = $this->createOffer();

        $other = Company::create(['name' => 'Other']);
        $this->grantLicense($other, ['recruitment']);
        $outsider = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $other->id]);
        Sanctum::actingAs($outsider);

        $this->getJson('/api/v1/offers')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson("/api/v1/offers/{$id}")->assertForbidden();
        $this->putJson("/api/v1/offers/{$id}", ['salary' => 1])->assertForbidden();
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 5])->assertStatus(422);
    }

    public function test_viewers_cannot_create_or_change_offers(): void
    {
        $id = $this->createOffer();
        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);

        $this->getJson("/api/v1/offers/{$id}")->assertOk();
        $this->postJson('/api/v1/offers', ['candidate_id' => $this->candidate->id, 'salary' => 5])->assertForbidden();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertForbidden();
        $this->deleteJson("/api/v1/offers/{$id}")->assertForbidden();
    }

    public function test_hr_managers_can_read_the_notifications_they_are_sent_about_offers(): void
    {
        // The notification centre is part of the communication module.
        \App\Models\License::where('company_id', $this->company->id)->update(['features' => ['recruitment', 'communication']]);

        $id = $this->createOffer();
        $this->postJson("/api/v1/offers/{$id}/submit")->assertOk();

        Sanctum::actingAs($this->hrManager);
        $response = $this->getJson('/api/v1/notifications?read=false')->assertOk();

        $response->assertJsonPath('data.0.title', 'Offer awaiting approval: Ali Khan')
            ->assertJsonPath('data.0.link', '/recruitment/offers');
    }
}
