<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Department $department;

    private User $recruiter;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment']);
        $this->department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        Sanctum::actingAs($this->recruiter);
    }

    private function makeJob(array $overrides = []): JobOpening
    {
        return JobOpening::create(array_merge([
            'title' => 'Backend Engineer',
            'department_id' => $this->department->id,
            'company_id' => $this->company->id,
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 1,
            'posted_at' => '2026-05-19',
        ], $overrides));
    }

    private function makeCandidate(JobOpening $job, array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => $job->id,
            'company_id' => $this->company->id,
            'full_name' => 'Ali Khan',
            'email' => 'ali.khan@example.com',
            'stage' => 'applied',
        ], $overrides));
    }

    private function makeEmployee(Company $company, string $email): Employee
    {
        return Employee::create([
            'user_id' => User::factory()->create(['company_id' => $company->id])->id,
            'company_id' => $company->id,
            'name' => 'Existing Employee',
            'email' => $email,
            'department_id' => Department::create(['name' => 'Ops', 'company_id' => $company->id])->id,
            'designation' => 'Analyst',
            'status' => 'active',
            'salary' => 1,
            'basic_salary' => 1,
        ]);
    }

    // ---- stage rules ---------------------------------------------------------

    public function test_stage_cannot_skip_steps_or_jump_to_hired(): void
    {
        $candidate = $this->makeCandidate($this->makeJob());

        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'offer'])->assertStatus(422);
        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'hired'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Use the Hire action to hire a candidate.']);

        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'screening'])->assertOk();
        $this->assertSame('screening', $candidate->fresh()->stage);
    }

    public function test_rejected_candidate_can_be_reopened_by_editor_but_not_by_view_only_user(): void
    {
        $candidate = $this->makeCandidate($this->makeJob(), ['stage' => 'rejected']);

        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'screening'])->assertOk();
        $this->assertSame('screening', $candidate->fresh()->stage);

        $createOnly = User::factory()->create(['company_id' => $this->company->id]);
        $createOnly->givePermissionTo(['recruitment:view', 'recruitment:create']);
        Candidate::whereKey($candidate->id)->update(['stage' => 'rejected']);
        Sanctum::actingAs($createOnly);

        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'screening'])->assertForbidden();
        $this->assertSame('rejected', $candidate->fresh()->stage);
    }

    // ---- hire action ---------------------------------------------------------

    public function test_hire_creates_employee_user_onboarding_and_closes_filled_job(): void
    {
        $job = $this->makeJob(['open_positions' => 1]);
        $candidate = $this->makeCandidate($job, ['stage' => 'offer']);

        $response = $this->postJson("/api/v1/candidates/{$candidate->id}/hire", [
            'salary' => 120000,
            'joining_date' => '2026-07-01',
            'skip_offer' => true,
        ])->assertOk();

        $response->assertJsonPath('data.candidate.stage', 'hired')
            ->assertJsonPath('data.candidate.onboarding_status', 'pending')
            ->assertJsonPath('data.employee.email', 'ali.khan@example.com');
        $this->assertNotEmpty($response->json('data.temp_password'));

        $employee = Employee::where('email', 'ali.khan@example.com')->firstOrFail();
        $this->assertSame($this->company->id, $employee->company_id);
        $this->assertSame($this->department->id, $employee->department_id);
        $this->assertEquals(120000, $employee->salary);

        $user = User::where('email', 'ali.khan@example.com')->firstOrFail();
        $this->assertSame($this->company->id, $user->company_id);
        $this->assertTrue($user->hasRole(User::ROLE_EMPLOYEE));

        $job->refresh();
        $this->assertSame('closed', $job->status);
        $this->assertNotNull($job->closed_at);

        $this->getJson('/api/v1/onboarding')->assertOk()->assertJsonPath('data.data.0.id', $candidate->id);
    }

    public function test_hire_keeps_job_open_until_all_positions_are_filled(): void
    {
        $job = $this->makeJob(['open_positions' => 2]);
        $candidate = $this->makeCandidate($job, ['stage' => 'offer']);

        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertOk();

        $this->assertSame('open', $job->fresh()->status);
    }

    public function test_hire_requires_offer_stage_salary_department_and_cannot_repeat(): void
    {
        $job = $this->makeJob();
        $applied = $this->makeCandidate($job, ['email' => 'a@example.com']);
        $this->postJson("/api/v1/candidates/{$applied->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertStatus(422);

        $noSalary = $this->makeCandidate($job, ['email' => 'b@example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$noSalary->id}/hire", ['skip_offer' => true])->assertStatus(422)->assertJsonValidationErrors('salary');

        $noDeptJob = $this->makeJob(['title' => 'Floating role', 'department_id' => null]);
        $noDept = $this->makeCandidate($noDeptJob, ['email' => 'c@example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$noDept->id}/hire", ['salary' => 100, 'skip_offer' => true])
            ->assertStatus(422)->assertJsonValidationErrors('job_opening_id');

        $ok = $this->makeCandidate($job, ['email' => 'd@example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$ok->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertOk();
        $this->postJson("/api/v1/candidates/{$ok->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertStatus(422);

        $this->assertSame(1, Employee::count());
    }

    public function test_hire_rejects_emails_already_used_in_another_company_or_by_an_employee(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        User::factory()->create(['email' => 'taken@example.com', 'company_id' => $other->id]);
        $job = $this->makeJob(['open_positions' => 5]);

        $crossCompany = $this->makeCandidate($job, ['email' => 'taken@example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$crossCompany->id}/hire", ['salary' => 100, 'skip_offer' => true])
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertSame('offer', $crossCompany->fresh()->stage);

        $this->makeEmployee($this->company, 'existing@example.com');
        $dup = $this->makeCandidate($job, ['email' => 'Existing@Example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$dup->id}/hire", ['salary' => 100, 'skip_offer' => true])
            ->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_hire_rejects_an_email_registered_to_an_employee_of_another_company(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $this->makeEmployee($other, 'ali.khan@example.com');
        $candidate = $this->makeCandidate($this->makeJob(), ['stage' => 'offer']);

        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100, 'skip_offer' => true])
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertSame('offer', $candidate->fresh()->stage);
        $this->assertSame(1, Employee::count());
    }

    // ---- company isolation ---------------------------------------------------

    public function test_job_cannot_use_a_department_from_another_company(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $foreignDepartment = Department::create(['name' => 'Foreign', 'company_id' => $other->id]);

        $this->postJson('/api/v1/job-openings', [
            'title' => 'Analyst',
            'department_id' => $foreignDepartment->id,
        ])->assertStatus(422)->assertJsonValidationErrors('department_id');

        $this->postJson('/api/v1/job-openings', [
            'title' => 'Analyst',
            'department_id' => $this->department->id,
        ])->assertCreated();
    }

    public function test_cannot_hire_a_candidate_from_another_company(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $foreignJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'status' => 'open', 'open_positions' => 1, 'employment_type' => 'full_time']);
        $foreign = Candidate::create(['job_opening_id' => $foreignJob->id, 'company_id' => $other->id, 'full_name' => 'F', 'email' => 'f@example.com', 'stage' => 'offer']);

        $this->postJson("/api/v1/candidates/{$foreign->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertForbidden();
    }

    // ---- permissions ---------------------------------------------------------

    public function test_hr_manager_can_manage_jobs_and_interviews_without_manage_settings(): void
    {
        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        Sanctum::actingAs($hr);

        $jobId = $this->postJson('/api/v1/job-openings', ['title' => 'QA Engineer', 'department_id' => $this->department->id])
            ->assertCreated()->json('data.id');
        $this->putJson("/api/v1/job-openings/{$jobId}", ['title' => 'Senior QA Engineer'])->assertOk();

        $candidate = $this->makeCandidate(JobOpening::findOrFail($jobId));
        $this->postJson('/api/v1/interviews', [
            'candidate_id' => $candidate->id, 'interviewer_name' => 'Sara', 'scheduled_at' => '2026-07-01 10:00:00',
        ])->assertCreated();
    }

    public function test_delete_requires_the_delete_permission(): void
    {
        $job = $this->makeJob();
        $candidate = $this->makeCandidate($job);
        $interview = Interview::create(['candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_name' => 'S', 'scheduled_at' => '2026-07-01 10:00:00']);

        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]); // no delete
        Sanctum::actingAs($hr);
        $this->deleteJson("/api/v1/interviews/{$interview->id}")->assertForbidden();
        $this->deleteJson("/api/v1/candidates/{$candidate->id}")->assertForbidden();

        Sanctum::actingAs($this->recruiter); // has delete
        $this->deleteJson("/api/v1/interviews/{$interview->id}")->assertOk();
        $this->deleteJson("/api/v1/candidates/{$candidate->id}")->assertOk();
        $this->deleteJson("/api/v1/job-openings/{$job->id}")->assertOk();
    }

    // ---- jobs & duplicates ---------------------------------------------------

    public function test_candidates_cannot_be_added_to_closed_jobs_or_duplicated(): void
    {
        $closed = $this->makeJob(['status' => 'closed']);
        $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $closed->id, 'full_name' => 'Late', 'email' => 'late@example.com',
        ])->assertStatus(422)->assertJsonValidationErrors('job_opening_id');

        $job = $this->makeJob(['title' => 'Open role']);
        $payload = ['job_opening_id' => $job->id, 'full_name' => 'Nina', 'email' => 'Nina@example.com'];
        $this->postJson('/api/v1/candidates', $payload)->assertCreated();
        $this->postJson('/api/v1/candidates', [...$payload, 'email' => 'nina@EXAMPLE.com'])
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $otherJob = $this->makeJob(['title' => 'Another role']);
        $this->postJson('/api/v1/candidates', [...$payload, 'job_opening_id' => $otherJob->id])->assertCreated();
    }

    public function test_closing_a_job_sets_closed_at_and_reopening_clears_it(): void
    {
        $job = $this->makeJob();

        $this->putJson("/api/v1/job-openings/{$job->id}", ['status' => 'closed'])->assertOk();
        $this->assertNotNull($job->fresh()->closed_at);

        $this->putJson("/api/v1/job-openings/{$job->id}", ['status' => 'open'])->assertOk();
        $this->assertNull($job->fresh()->closed_at);
    }

    public function test_job_with_candidates_cannot_be_deleted(): void
    {
        $job = $this->makeJob();
        $candidate = $this->makeCandidate($job);

        $this->deleteJson("/api/v1/job-openings/{$job->id}")->assertStatus(422);
        $this->assertNotNull(JobOpening::find($job->id));

        $candidate->delete();
        $this->deleteJson("/api/v1/job-openings/{$job->id}")->assertOk();
    }

    public function test_hired_candidate_cannot_be_deleted(): void
    {
        $candidate = $this->makeCandidate($this->makeJob(), ['stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertOk();

        $this->deleteJson("/api/v1/candidates/{$candidate->id}")->assertStatus(422);
        $this->assertNotNull(Candidate::find($candidate->id));
    }

    // ---- onboarding & interviews --------------------------------------------

    public function test_onboarding_requires_hired_candidate_and_cannot_be_deleted(): void
    {
        $job = $this->makeJob(['open_positions' => 3]);
        $applied = $this->makeCandidate($job, ['email' => 'p@example.com']);
        $this->postJson('/api/v1/onboarding', ['candidate_id' => $applied->id, 'onboarding_status' => 'pending'])
            ->assertStatus(422);
        $this->putJson("/api/v1/onboarding/{$applied->id}", ['onboarding_status' => 'completed'])->assertStatus(422);

        $offer = $this->makeCandidate($job, ['email' => 'q@example.com', 'stage' => 'offer']);
        $this->postJson("/api/v1/candidates/{$offer->id}/hire", ['salary' => 100, 'skip_offer' => true])->assertOk();

        $this->putJson("/api/v1/onboarding/{$offer->id}", ['onboarding_status' => 'in_progress', 'onboarding_notes' => 'Laptop ordered'])
            ->assertOk()->assertJsonPath('data.onboarding_status', 'in_progress');

        $this->deleteJson("/api/v1/onboarding/{$offer->id}")->assertStatus(422);
        $this->assertSame('in_progress', $offer->fresh()->onboarding_status);
        $this->assertSame('hired', $offer->fresh()->stage);
    }

    public function test_interview_cannot_be_moved_to_another_candidate(): void
    {
        $job = $this->makeJob();
        $first = $this->makeCandidate($job);
        $second = $this->makeCandidate($job, ['email' => 'second@example.com']);
        $interview = Interview::create(['candidate_id' => $first->id, 'company_id' => $this->company->id, 'interviewer_name' => 'S', 'scheduled_at' => '2026-07-01 10:00:00']);

        $this->putJson("/api/v1/interviews/{$interview->id}", ['candidate_id' => $second->id])->assertStatus(422);
        $this->putJson("/api/v1/interviews/{$interview->id}", ['candidate_id' => $first->id, 'result' => 'pass'])->assertOk();
        $this->assertSame($first->id, $interview->fresh()->candidate_id);
    }

    // ---- lists, stats, score -------------------------------------------------

    public function test_candidate_list_paginates_filters_and_stats_are_not_page_bound(): void
    {
        $job = $this->makeJob(['open_positions' => 50]);
        for ($i = 1; $i <= 20; $i++) {
            $this->makeCandidate($job, [
                'email' => "c{$i}@example.com",
                'full_name' => "Candidate {$i}",
                'stage' => $i <= 5 ? 'interview' : 'applied',
                'source' => $i % 2 ? 'LinkedIn' : 'Referral',
            ]);
        }

        $this->getJson('/api/v1/candidates?per_page=8&page=3')
            ->assertOk()
            ->assertJsonCount(4, 'data.data')
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.last_page', 3);

        $this->getJson('/api/v1/candidates?stage=interview&per_page=100')->assertOk()->assertJsonCount(5, 'data.data');
        $this->getJson('/api/v1/candidates?source=Referral&per_page=100')->assertOk()->assertJsonCount(10, 'data.data');

        $this->getJson('/api/v1/recruitment/stats')
            ->assertOk()
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.interview', 5)
            ->assertJsonPath('data.hired', 0);

        $summary = $this->getJson("/api/v1/recruitment/pipeline-summary?job_opening_id={$job->id}")
            ->assertOk()->json('data');
        $this->assertSame(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'], array_column($summary, 'stage'));
        $this->assertSame([15, 0, 5, 0, 0, 0], array_column($summary, 'count'));
    }

    public function test_unrated_candidate_score_uses_a_neutral_base(): void
    {
        $candidate = $this->makeCandidate($this->makeJob());
        $this->assertNull($candidate->fresh()->score);

        Interview::create(['candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_name' => 'S', 'scheduled_at' => '2026-07-01 10:00:00', 'result' => 'pass']);

        $this->assertSame(60, $candidate->fresh()->score); // 3 stars (48) + one pass (12)
    }
}
