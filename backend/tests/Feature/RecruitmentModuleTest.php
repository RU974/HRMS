<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentModuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_recruiter_can_run_recruitment_flow(): void
    {
        $recruiter = $this->createUserWithRole(User::ROLE_RECRUITER);
        $department = Department::create(['name' => 'Engineering']);
        Sanctum::actingAs($recruiter);

        $jobResponse = $this->postJson('/api/v1/job-openings', [
            'title' => 'Backend Engineer',
            'department_id' => $department->id,
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 2,
            'posted_at' => '2026-05-19',
        ])->assertCreated();
        $jobId = $jobResponse->json('data.id');

        $candidateResponse = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $jobId,
            'full_name' => 'Ali Khan',
            'email' => 'ali.khan@example.com',
            'stage' => 'applied',
            'rating' => 4,
        ])->assertCreated();
        $candidateId = $candidateResponse->json('data.id');

        $this->postJson('/api/v1/interviews', [
            'candidate_id' => $candidateId,
            'interviewer_name' => 'Sara Manager',
            'interview_type' => 'technical',
            'scheduled_at' => '2026-05-20 10:00:00',
            'result' => 'pending',
        ])->assertCreated();

        $this->putJson("/api/v1/candidates/{$candidateId}", [
            'stage' => 'hired',
        ])->assertOk();

        $this->postJson('/api/v1/onboarding', [
            'candidate_id' => $candidateId,
            'onboarding_status' => 'in_progress',
            'onboarding_start_date' => '2026-05-21',
            'onboarding_notes' => 'Offer accepted and docs pending',
        ])->assertCreated();

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.data.0.id', $candidateId);

        $this->getJson('/api/v1/recruitment/pipeline-summary')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_non_recruitment_role_cannot_access_recruitment_routes(): void
    {
        $employee = $this->createUserWithRole(User::ROLE_EMPLOYEE);
        Sanctum::actingAs($employee);

        $this->getJson('/api/v1/job-openings')->assertForbidden();
        $this->getJson('/api/v1/candidates')->assertForbidden();
        $this->getJson('/api/v1/interviews')->assertForbidden();
        $this->getJson('/api/v1/onboarding')->assertForbidden();
    }

    public function test_recruitment_viewers_cannot_create_update_or_delete_resources(): void
    {
        $viewer = User::factory()->create();
        $viewer->givePermissionTo('view recruitment');
        Sanctum::actingAs($viewer);

        $jobOpening = JobOpening::create([
            'title' => 'Business Analyst',
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 1,
            'posted_at' => '2026-05-19',
        ]);

        $candidate = Candidate::create([
            'job_opening_id' => $jobOpening->id,
            'full_name' => 'Zara Patel',
            'email' => 'zara.patel@example.com',
            'stage' => 'applied',
            'rating' => 3,
        ]);

        $interview = Interview::create([
            'candidate_id' => $candidate->id,
            'interviewer_name' => 'Hiring Lead',
            'interview_type' => 'technical',
            'scheduled_at' => '2026-05-20 10:00:00',
            'result' => 'pending',
        ]);

        $hiredCandidate = Candidate::create([
            'job_opening_id' => $jobOpening->id,
            'full_name' => 'Hired User',
            'email' => 'hired.user@example.com',
            'stage' => 'hired',
            'rating' => 5,
            'onboarding_status' => 'pending',
        ]);

        $this->getJson('/api/v1/job-openings')->assertOk();
        $this->getJson('/api/v1/candidates')->assertOk();
        $this->getJson('/api/v1/interviews')->assertOk();
        $this->getJson('/api/v1/onboarding')->assertOk();

        $this->postJson('/api/v1/job-openings', [
            'title' => 'HR Analyst',
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 1,
            'posted_at' => '2026-05-19',
        ])->assertForbidden();

        $this->putJson("/api/v1/job-openings/{$jobOpening->id}", ['title' => 'Updated Title'])->assertForbidden();
        $this->deleteJson("/api/v1/job-openings/{$jobOpening->id}")->assertForbidden();

        $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $jobOpening->id,
            'full_name' => 'Ali Khan',
            'email' => 'ali.khan@example.com',
            'stage' => 'applied',
            'rating' => 4,
        ])->assertForbidden();

        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'screening'])->assertForbidden();
        $this->deleteJson("/api/v1/candidates/{$candidate->id}")->assertForbidden();

        $this->postJson('/api/v1/interviews', [
            'candidate_id' => $candidate->id,
            'interviewer_name' => 'Sara Manager',
            'interview_type' => 'technical',
            'scheduled_at' => '2026-05-20 10:00:00',
            'result' => 'pending',
        ])->assertForbidden();

        $this->putJson("/api/v1/interviews/{$interview->id}", ['result' => 'pass'])->assertForbidden();
        $this->deleteJson("/api/v1/interviews/{$interview->id}")->assertForbidden();

        $this->postJson('/api/v1/onboarding', [
            'candidate_id' => $hiredCandidate->id,
            'onboarding_status' => 'in_progress',
            'onboarding_start_date' => '2026-05-21',
            'onboarding_notes' => 'Offer accepted',
        ])->assertForbidden();

        $this->putJson("/api/v1/onboarding/{$hiredCandidate->id}", ['onboarding_status' => 'completed'])->assertForbidden();
        $this->deleteJson("/api/v1/onboarding/{$hiredCandidate->id}")->assertForbidden();
    }

    public function test_recruitment_data_is_scoped_to_the_authenticated_company(): void
    {
        $companyA = Company::create(['name' => 'Company A']);
        $companyB = Company::create(['name' => 'Company B']);

        $recruiterA = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $companyA->id]);
        $recruiterB = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $companyB->id]);

        $department = Department::create(['name' => 'Engineering']);

        Sanctum::actingAs($recruiterA);
        $jobA = $this->postJson('/api/v1/job-openings', [
            'title' => 'Backend Engineer',
            'department_id' => $department->id,
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 2,
            'posted_at' => '2026-05-19',
        ])->assertCreated()->json('data');

        $candidateA = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $jobA['id'],
            'full_name' => 'Ali Khan',
            'email' => 'ali.khan@example.com',
            'stage' => 'applied',
            'rating' => 4,
        ])->assertCreated()->json('data');

        $interviewA = $this->postJson('/api/v1/interviews', [
            'candidate_id' => $candidateA['id'],
            'interviewer_name' => 'Sara Manager',
            'interview_type' => 'technical',
            'scheduled_at' => '2026-05-20 10:00:00',
            'result' => 'pending',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($recruiterB);
        $jobB = $this->postJson('/api/v1/job-openings', [
            'title' => 'Frontend Engineer',
            'department_id' => $department->id,
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 1,
            'posted_at' => '2026-05-19',
        ])->assertCreated()->json('data');

        $candidateB = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $jobB['id'],
            'full_name' => 'Nina Patel',
            'email' => 'nina.patel@example.com',
            'stage' => 'applied',
            'rating' => 5,
        ])->assertCreated()->json('data');

        $interviewB = $this->postJson('/api/v1/interviews', [
            'candidate_id' => $candidateB['id'],
            'interviewer_name' => 'Alex Hiring',
            'interview_type' => 'technical',
            'scheduled_at' => '2026-05-21 14:00:00',
            'result' => 'pending',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($recruiterA);

        $this->getJson('/api/v1/job-openings')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $jobA['id']);

        $this->getJson('/api/v1/candidates')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $candidateA['id']);

        $this->getJson('/api/v1/interviews')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $interviewA['id']);

        $this->getJson('/api/v1/search?q=Ali')
            ->assertOk()
            ->assertJsonMissing(['id' => $candidateB['id']])
            ->assertJsonMissing(['id' => $jobB['id']])
            ->assertJsonMissing(['id' => $interviewB['id']]);

        $this->getJson('/api/v1/recruitment/pipeline-summary')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.count', 1);

        $this->getJson('/api/v1/job-openings/' . $jobB['id'])->assertForbidden();
        $this->putJson('/api/v1/job-openings/' . $jobB['id'], ['title' => 'Updated Title'])->assertForbidden();
        $this->deleteJson('/api/v1/job-openings/' . $jobB['id'])->assertForbidden();

        $this->getJson('/api/v1/candidates/' . $candidateB['id'])->assertForbidden();
        $this->putJson('/api/v1/candidates/' . $candidateB['id'], ['stage' => 'screening'])->assertForbidden();
        $this->deleteJson('/api/v1/candidates/' . $candidateB['id'])->assertForbidden();

        $this->getJson('/api/v1/interviews/' . $interviewB['id'])->assertForbidden();
        $this->putJson('/api/v1/interviews/' . $interviewB['id'], ['result' => 'pass'])->assertForbidden();
        $this->deleteJson('/api/v1/interviews/' . $interviewB['id'])->assertForbidden();
    }
}


