<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentModuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_recruiter_can_run_recruitment_flow(): void
    {
        $recruiter = User::factory()->create(['role' => User::ROLE_RECRUITER]);
        $department = Department::create(['name' => 'Engineering']);
        Sanctum::actingAs($recruiter);

        $jobResponse = $this->postJson('/api/job-openings', [
            'title' => 'Backend Engineer',
            'department_id' => $department->id,
            'employment_type' => 'full_time',
            'status' => 'open',
            'open_positions' => 2,
            'posted_at' => '2026-05-19',
        ])->assertCreated();
        $jobId = $jobResponse->json('data.id');

        $candidateResponse = $this->postJson('/api/candidates', [
            'job_opening_id' => $jobId,
            'full_name' => 'Ali Khan',
            'email' => 'ali.khan@example.com',
            'stage' => 'applied',
            'rating' => 4,
        ])->assertCreated();
        $candidateId = $candidateResponse->json('data.id');

        $this->postJson('/api/interviews', [
            'candidate_id' => $candidateId,
            'interviewer_name' => 'Sara Manager',
            'interview_type' => 'technical',
            'scheduled_at' => '2026-05-20 10:00:00',
            'result' => 'pending',
        ])->assertCreated();

        $this->getJson('/api/recruitment/pipeline-summary')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_non_recruitment_role_cannot_access_recruitment_routes(): void
    {
        $employee = User::factory()->create(['role' => User::ROLE_EMPLOYEE]);
        Sanctum::actingAs($employee);

        $this->getJson('/api/job-openings')->assertForbidden();
        $this->getJson('/api/candidates')->assertForbidden();
        $this->getJson('/api/interviews')->assertForbidden();
    }
}
