<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentTalentPoolTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private JobOpening $jobA;

    private JobOpening $jobB;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->company = Company::create(['name' => 'Acme HR', 'careers_slug' => 'acme', 'careers_enabled' => true]);
        $this->grantLicense($this->company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->jobA = $this->makeJob('Backend Engineer', $department);
        $this->jobB = $this->makeJob('Platform Engineer', $department);
        Sanctum::actingAs($this->recruiter);
    }

    private function makeJob(string $title, Department $department, array $overrides = []): JobOpening
    {
        return JobOpening::create(array_merge([
            'title' => $title, 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1, 'is_public' => true,
        ], $overrides));
    }

    private function candidate(JobOpening $job, array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => $job->id, 'company_id' => $this->company->id,
            'full_name' => 'Ayesha Malik', 'email' => 'ayesha@example.com', 'phone' => '+92 300 1234567', 'stage' => 'applied',
        ], $overrides));
    }

    // ---- duplicates ---------------------------------------------------------------

    public function test_the_same_email_or_phone_on_several_jobs_is_flagged(): void
    {
        $first = $this->candidate($this->jobA);
        $byEmail = $this->candidate($this->jobB, ['email' => 'AYESHA@example.com', 'phone' => null]);
        $byPhone = $this->candidate($this->jobB, ['email' => 'second@example.com', 'phone' => '0300-1234567']);
        $stranger = $this->candidate($this->jobB, ['email' => 'stranger@example.com', 'phone' => '0345 9999999', 'full_name' => 'Someone Else']);

        $this->assertSame('3001234567', $first->fresh()->phone_normalized);
        $this->assertSame('3001234567', $byPhone->fresh()->phone_normalized);

        $detail = $this->getJson("/api/v1/candidates/{$first->id}")->assertOk();
        $ids = collect($detail->json('data.duplicates'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$byEmail->id, $byPhone->id], $ids);
        $this->assertSame('Platform Engineer', $detail->json('data.duplicates.0.job_title'));

        $list = $this->getJson('/api/v1/candidates')->assertOk()->json('data.data');
        $counts = collect($list)->pluck('duplicate_count', 'id');
        $this->assertSame(2, $counts[$first->id]);
        $this->assertSame(0, $counts[$stranger->id]);

        $only = $this->getJson('/api/v1/candidates?duplicates=1')->assertOk();
        $this->assertEqualsCanonicalizing([$first->id, $byEmail->id, $byPhone->id], collect($only->json('data.data'))->pluck('id')->all());
    }

    public function test_duplicates_never_cross_companies(): void
    {
        $this->candidate($this->jobA);

        $other = Company::create(['name' => 'Other Co']);
        $otherJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        Candidate::create(['job_opening_id' => $otherJob->id, 'company_id' => $other->id, 'full_name' => 'Ayesha Malik', 'email' => 'ayesha@example.com', 'phone' => '0300 1234567']);

        $mine = Candidate::where('company_id', $this->company->id)->first();
        $this->getJson("/api/v1/candidates/{$mine->id}")->assertJsonCount(0, 'data.duplicates');
        $this->getJson('/api/v1/candidates?duplicates=1')->assertJsonCount(0, 'data.data');
    }

    public function test_applying_through_the_careers_page_to_a_second_job_is_allowed_and_flagged(): void
    {
        foreach ([$this->jobA, $this->jobB] as $job) {
            $this->post("/api/v1/public/careers/acme/jobs/{$job->id}/apply", [
                'full_name' => 'Zara Applicant', 'email' => 'zara@example.com',
                'resume' => UploadedFile::fake()->create('cv.pdf', 50, 'application/pdf'),
            ], ['Accept' => 'application/json'])->assertCreated();
        }

        $this->getJson('/api/v1/candidates?duplicates=1')->assertJsonCount(2, 'data.data');
    }

    // ---- talent pool --------------------------------------------------------------

    public function test_rejecting_can_keep_the_candidate_as_a_silver_medalist(): void
    {
        $candidate = $this->candidate($this->jobA, ['stage' => 'interview']);

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'rejected', 'reason' => 'Another candidate was a closer fit', 'talent_pool' => 'silver_medalist'])
            ->assertOk()
            ->assertJsonPath('data.stage', 'rejected')
            ->assertJsonPath('data.talent_pool', 'silver_medalist');

        $this->assertNotNull($candidate->fresh()->talent_pool_added_at);
        $this->getJson('/api/v1/candidates?talent_pool=silver_medalist')->assertJsonCount(1, 'data.data');
        $this->getJson('/api/v1/candidates?talent_pool=any')->assertJsonCount(1, 'data.data');
        $this->getJson('/api/v1/candidates?talent_pool=none')->assertJsonCount(0, 'data.data');
    }

    public function test_pool_membership_can_be_added_noted_and_removed(): void
    {
        $candidate = $this->candidate($this->jobA, ['stage' => 'rejected', 'rejection_reason' => 'Budget']);

        $this->postJson("/api/v1/candidates/{$candidate->id}/talent-pool", ['pool' => 'general', 'note' => 'Great communicator'])
            ->assertOk()
            ->assertJsonPath('data.talent_pool', 'general')
            ->assertJsonPath('data.talent_pool_note', 'Great communicator');

        $this->postJson("/api/v1/candidates/{$candidate->id}/talent-pool", ['pool' => 'bogus'])->assertStatus(422);

        $this->deleteJson("/api/v1/candidates/{$candidate->id}/talent-pool")
            ->assertOk()
            ->assertJsonPath('data.talent_pool', null);
        $this->assertNull($candidate->fresh()->talent_pool_note);
    }

    public function test_hired_candidates_cannot_join_the_pool_and_viewers_cannot_change_it(): void
    {
        $hired = $this->candidate($this->jobA, ['stage' => 'hired']);
        $this->postJson("/api/v1/candidates/{$hired->id}/talent-pool", ['pool' => 'general'])->assertStatus(422);

        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);
        $open = $this->candidate($this->jobA, ['email' => 'v@example.com']);
        $this->postJson("/api/v1/candidates/{$open->id}/talent-pool", ['pool' => 'general'])->assertForbidden();
        $this->postJson("/api/v1/candidates/{$open->id}/consider", ['job_opening_id' => $this->jobB->id])->assertForbidden();
    }

    public function test_a_pool_candidate_can_be_put_forward_for_another_job_keeping_their_profile(): void
    {
        $original = $this->candidate($this->jobA, [
            'stage' => 'rejected', 'rejection_reason' => 'Other hire', 'talent_pool' => 'silver_medalist',
            'skills' => ['PHP', 'Laravel'], 'experience_years' => 6, 'tags' => ['strong'], 'resume_text' => 'laravel developer',
        ]);
        Storage::disk('local')->put('recruitment/resumes/x/cv.pdf', 'pdf-bytes');
        $original->update(['resume_path' => 'recruitment/resumes/x/cv.pdf', 'resume_original_name' => 'cv.pdf']);

        $response = $this->postJson("/api/v1/candidates/{$original->id}/consider", ['job_opening_id' => $this->jobB->id])->assertCreated();

        $copyId = $response->json('data.id');
        $this->assertNotSame($original->id, $copyId);
        $response->assertJsonPath('data.stage', 'applied')
            ->assertJsonPath('data.job_opening_id', $this->jobB->id)
            ->assertJsonPath('data.source', 'Talent pool')
            ->assertJsonPath('data.talent_pool', null);

        $copy = Candidate::findOrFail($copyId);
        $this->assertSame(['PHP', 'Laravel'], $copy->skills);
        $this->assertSame(6.0, $copy->experience_years);
        $this->assertNotSame($original->resume_path, $copy->resume_path);
        Storage::disk('local')->assertExists($copy->resume_path);
        $this->assertSame('rejected', $original->fresh()->stage, 'the original application is untouched');
        $this->assertDatabaseHas('candidate_stage_histories', ['candidate_id' => $copyId, 'to_stage' => 'applied']);

        // Already applied / closed job / same job are refused.
        $this->postJson("/api/v1/candidates/{$original->id}/consider", ['job_opening_id' => $this->jobB->id])->assertStatus(422);
        $this->postJson("/api/v1/candidates/{$original->id}/consider", ['job_opening_id' => $this->jobA->id])->assertStatus(422);
        $closed = $this->makeJob('Closed', Department::first(), ['status' => 'closed']);
        $this->postJson("/api/v1/candidates/{$original->id}/consider", ['job_opening_id' => $closed->id])->assertStatus(422);
    }

    public function test_cannot_consider_a_candidate_for_a_job_of_another_company(): void
    {
        $candidate = $this->candidate($this->jobA, ['stage' => 'rejected', 'rejection_reason' => 'x']);
        $other = Company::create(['name' => 'Other Co']);
        $foreignJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);

        $this->postJson("/api/v1/candidates/{$candidate->id}/consider", ['job_opening_id' => $foreignJob->id])->assertStatus(422);

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $other->id]));
        $this->grantLicense($other, ['recruitment']);
        $this->postJson("/api/v1/candidates/{$candidate->id}/talent-pool", ['pool' => 'general'])->assertForbidden();
    }
}
