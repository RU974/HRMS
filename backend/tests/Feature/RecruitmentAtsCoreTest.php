<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentAtsCoreTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private JobOpening $job;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 3,
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function candidate(array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id,
            'full_name' => 'Ali Khan', 'email' => 'ali@example.com', 'stage' => 'applied',
        ], $overrides));
    }

    // ---- stage history ---------------------------------------------------------

    public function test_creating_and_moving_a_candidate_records_stage_history(): void
    {
        $id = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $this->job->id, 'full_name' => 'Nina', 'email' => 'nina@example.com',
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/v1/candidates/{$id}/stage", ['stage' => 'screening'])->assertOk();
        $this->putJson("/api/v1/candidates/{$id}", ['stage' => 'interview'])->assertOk();

        $history = CandidateStageHistory::where('candidate_id', $id)->orderBy('id')->get();
        $this->assertSame([[null, 'applied'], ['applied', 'screening'], ['screening', 'interview']],
            $history->map(fn ($row) => [$row->from_stage, $row->to_stage])->all());
        $this->assertSame($this->recruiter->id, $history->last()->changed_by);

        $this->getJson("/api/v1/candidates/{$id}")
            ->assertOk()
            ->assertJsonCount(3, 'data.stage_histories')
            ->assertJsonPath('data.stage_histories.0.to_stage', 'interview')
            ->assertJsonPath('data.stage_histories.0.changed_by.name', $this->recruiter->name);
    }

    public function test_stage_endpoint_rejects_invalid_transitions_and_does_not_write_history(): void
    {
        $candidate = $this->candidate();

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'offer'])->assertStatus(422);
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'hired'])->assertStatus(422);
        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'bogus'])->assertStatus(422);

        $this->assertSame(0, CandidateStageHistory::count());
        $this->assertSame('applied', $candidate->fresh()->stage);
    }

    public function test_rejecting_requires_a_reason_which_is_stored_and_cleared_on_reopen(): void
    {
        $candidate = $this->candidate(['stage' => 'screening']);

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'rejected'])
            ->assertStatus(422)->assertJsonValidationErrors('rejection_reason');
        $this->putJson("/api/v1/candidates/{$candidate->id}", ['stage' => 'rejected'])
            ->assertStatus(422)->assertJsonValidationErrors('rejection_reason');
        $this->assertSame('screening', $candidate->fresh()->stage);

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'rejected', 'reason' => 'Salary expectations too high'])
            ->assertOk()->assertJsonPath('data.rejection_reason', 'Salary expectations too high');
        $this->assertSame('Salary expectations too high', CandidateStageHistory::latest('id')->first()->reason);

        $this->patchJson("/api/v1/candidates/{$candidate->id}/stage", ['stage' => 'screening'])
            ->assertOk()->assertJsonPath('data.rejection_reason', null);
    }

    public function test_hiring_records_the_final_stage_change(): void
    {
        $candidate = $this->candidate(['stage' => 'offer']);

        $this->postJson("/api/v1/candidates/{$candidate->id}/hire", ['salary' => 100000, 'skip_offer' => true])->assertOk();

        $last = CandidateStageHistory::where('candidate_id', $candidate->id)->latest('id')->first();
        $this->assertSame(['offer', 'hired'], [$last->from_stage, $last->to_stage]);
    }

    // ---- notes & tags ----------------------------------------------------------

    public function test_notes_can_be_added_listed_and_only_deleted_by_author_or_deleter(): void
    {
        $candidate = $this->candidate();

        $noteId = $this->postJson("/api/v1/candidates/{$candidate->id}/notes", ['body' => '  Strong portfolio  '])
            ->assertCreated()->assertJsonPath('data.body', 'Strong portfolio')->json('data.id');
        $this->postJson("/api/v1/candidates/{$candidate->id}/notes", ['body' => ''])->assertStatus(422);

        $this->getJson("/api/v1/candidates/{$candidate->id}/notes")->assertOk()->assertJsonCount(1, 'data');

        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]); // create/edit, no delete
        Sanctum::actingAs($hr);
        $this->deleteJson("/api/v1/candidates/{$candidate->id}/notes/{$noteId}")->assertForbidden();

        Sanctum::actingAs($this->recruiter);
        $this->deleteJson("/api/v1/candidates/{$candidate->id}/notes/{$noteId}")->assertOk();
        $this->assertSame(0, $candidate->candidateNotes()->count());
    }

    public function test_tags_are_normalised_and_filterable(): void
    {
        $id = $this->postJson('/api/v1/candidates', [
            'job_opening_id' => $this->job->id, 'full_name' => 'Tagged', 'email' => 't@example.com',
            'tags' => ['php', ' laravel ', 'php'],
        ])->assertCreated()->assertJsonPath('data.tags', ['php', 'laravel'])->json('data.id');
        $this->candidate(['email' => 'other@example.com', 'full_name' => 'Other']);

        $this->getJson('/api/v1/candidates?tag=laravel')->assertOk()->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $id);
    }

    // ---- resume ----------------------------------------------------------------

    public function test_resume_upload_download_replace_and_delete(): void
    {
        $candidate = $this->candidate();

        $response = $this->post("/api/v1/candidates/{$candidate->id}/resume", [
            'resume' => UploadedFile::fake()->create('cv.pdf', 200, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk();

        $response->assertJsonPath('data.has_resume', true)->assertJsonPath('data.resume_original_name', 'cv.pdf');
        $this->assertArrayNotHasKey('resume_path', $response->json('data'));

        $first = $candidate->fresh()->resume_path;
        Storage::disk('local')->assertExists($first);

        $this->get("/api/v1/candidates/{$candidate->id}/resume?download=1")->assertOk()->assertHeader('content-disposition');

        $this->post("/api/v1/candidates/{$candidate->id}/resume", [
            'resume' => UploadedFile::fake()->create('cv2.docx', 100),
        ], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('local')->assertMissing($first);
        Storage::disk('local')->assertExists($candidate->fresh()->resume_path);

        $this->deleteJson("/api/v1/candidates/{$candidate->id}/resume")->assertOk()->assertJsonPath('data.has_resume', false);
        $this->get("/api/v1/candidates/{$candidate->id}/resume")->assertNotFound();
    }

    public function test_resume_rejects_bad_files_and_unauthorised_users(): void
    {
        $candidate = $this->candidate();

        $this->post("/api/v1/candidates/{$candidate->id}/resume", [
            'resume' => UploadedFile::fake()->create('virus.exe', 10),
        ], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post("/api/v1/candidates/{$candidate->id}/resume", [
            'resume' => UploadedFile::fake()->create('huge.pdf', 6000, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);
        $this->post("/api/v1/candidates/{$candidate->id}/resume", [
            'resume' => UploadedFile::fake()->create('cv.pdf', 10, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertForbidden();

        $other = Company::create(['name' => 'Other']);
        $this->grantLicense($other, ['recruitment']);
        $outsider = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $other->id]);
        Sanctum::actingAs($outsider);
        $this->get("/api/v1/candidates/{$candidate->id}/resume")->assertForbidden();
    }

    public function test_deleting_a_candidate_removes_the_resume_file(): void
    {
        $candidate = $this->candidate();
        $this->post("/api/v1/candidates/{$candidate->id}/resume", [
            'resume' => UploadedFile::fake()->create('cv.pdf', 10, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk();
        $path = $candidate->fresh()->resume_path;

        $this->deleteJson("/api/v1/candidates/{$candidate->id}")->assertOk();
        Storage::disk('local')->assertMissing($path);
    }

    // ---- board -----------------------------------------------------------------

    public function test_board_returns_counts_and_a_limited_set_per_stage_and_respects_filters(): void
    {
        foreach (range(1, 5) as $i) {
            $this->candidate(['email' => "a{$i}@example.com", 'full_name' => "Applied {$i}", 'source' => 'LinkedIn']);
        }
        $this->candidate(['email' => 's@example.com', 'full_name' => 'Screening One', 'stage' => 'screening', 'source' => 'Referral']);

        $stages = collect($this->getJson('/api/v1/recruitment/board?limit=3')->assertOk()->json('data.stages'))->keyBy('stage');
        $this->assertSame(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'], $stages->keys()->all());
        $this->assertSame(5, $stages['applied']['count']);
        $this->assertCount(3, $stages['applied']['candidates']);
        $this->assertSame(1, $stages['screening']['count']);
        $this->assertSame('Screening One', $stages['screening']['candidates'][0]['full_name']);
        $this->assertArrayNotHasKey('resume_path', $stages['applied']['candidates'][0]);

        $filtered = collect($this->getJson('/api/v1/recruitment/board?source=Referral')->assertOk()->json('data.stages'))->keyBy('stage');
        $this->assertSame(0, $filtered['applied']['count']);
        $this->assertSame(1, $filtered['screening']['count']);
    }

    public function test_the_free_text_notes_column_is_never_shadowed_by_the_note_thread(): void
    {
        $candidate = $this->candidate(['notes' => 'Screening call went well']);
        $this->postJson("/api/v1/candidates/{$candidate->id}/notes", ['body' => 'Thread entry'])->assertCreated();

        $this->getJson("/api/v1/candidates/{$candidate->id}")
            ->assertOk()
            ->assertJsonPath('data.notes', 'Screening call went well')
            ->assertJsonCount(1, 'data.candidate_notes')
            ->assertJsonPath('data.candidate_notes.0.body', 'Thread entry');

        $this->putJson("/api/v1/candidates/{$candidate->id}", ['rating' => 4])
            ->assertOk()->assertJsonPath('data.notes', 'Screening call went well');
    }
}
