<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateNote;
use App\Models\Company;
use App\Models\Department;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\User;
use App\Services\Recruitment\ResumeParserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsResumeFiles;
use Tests\TestCase;

class RecruitmentFitAndMergeTest extends TestCase
{
    use BuildsResumeFiles;
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hrManager;

    private JobOpening $job;

    private JobOpening $otherJob;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($this->company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $this->job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 2,
            'requirements' => 'Must know PHP, Laravel and Docker. 5+ years of experience.',
        ]);
        $this->otherJob = JobOpening::create([
            'title' => 'Platform Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1,
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function candidate(array $overrides = [], ?JobOpening $job = null): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => ($job ?? $this->job)->id, 'company_id' => $this->company->id,
            'full_name' => 'Ayesha Malik', 'email' => 'ayesha.malik@example.com', 'stage' => 'applied',
        ], $overrides));
    }

    // ---- fit scoring ------------------------------------------------------------------

    public function test_a_resume_is_scored_against_the_job_requirements(): void
    {
        $candidate = $this->candidate();

        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();

        $candidate->refresh();
        $this->assertSame(100, $candidate->fit_score);
        $this->assertEqualsCanonicalizing(['PHP', 'Laravel', 'Docker'], $candidate->fit_breakdown['matched_skills']);
        $this->assertSame([], $candidate->fit_breakdown['missing_skills']);
        $this->assertEquals(5.0, $candidate->fit_breakdown['required_years']);
    }

    public function test_missing_skills_and_short_experience_lower_the_score_and_no_resume_means_no_score(): void
    {
        $weak = $this->candidate(['email' => 'weak@example.com', 'full_name' => 'Weak Fit', 'skills' => ['PHP'], 'resume_text' => 'PHP developer', 'experience_years' => 2]);
        $none = $this->candidate(['email' => 'none@example.com', 'full_name' => 'No Resume']);

        app(\App\Services\Recruitment\FitScoringService::class)->rescore($weak);
        app(\App\Services\Recruitment\FitScoringService::class)->rescore($none);

        // 1 of 3 skills (70 points x 1/3) plus 2 of 5 years (30 points x 0.4).
        $this->assertSame(35, $weak->fresh()->fit_score);
        $this->assertEqualsCanonicalizing(['Laravel', 'Docker'], $weak->fresh()->fit_breakdown['missing_skills']);
        $this->assertNull($none->fresh()->fit_score);
        $this->assertSame('no_resume', $none->fresh()->fit_breakdown['reason']);
    }

    public function test_applicants_can_be_ranked_and_filtered_by_fit(): void
    {
        $best = $this->candidate(['email' => 'best@example.com', 'full_name' => 'Best Fit', 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'x', 'experience_years' => 7]);
        $mid = $this->candidate(['email' => 'mid@example.com', 'full_name' => 'Mid Fit', 'skills' => ['PHP', 'Laravel'], 'resume_text' => 'x', 'experience_years' => 5]);
        $blank = $this->candidate(['email' => 'blank@example.com', 'full_name' => 'Blank']);
        $service = app(\App\Services\Recruitment\FitScoringService::class);
        $service->rescore($best);
        $service->rescore($mid);
        $service->rescore($blank);

        $order = collect($this->getJson('/api/v1/candidates?sort=fit')->assertOk()->json('data.data'))->pluck('id')->all();
        $this->assertSame([$best->id, $mid->id, $blank->id], $order);

        $filtered = collect($this->getJson('/api/v1/candidates?min_fit=90')->assertOk()->json('data.data'))->pluck('id')->all();
        $this->assertSame([$best->id], $filtered);

        $board = $this->getJson('/api/v1/recruitment/board?sort=fit')->assertOk()->json('data.stages.0.candidates');
        $this->assertSame([$best->id, $mid->id, $blank->id], collect($board)->pluck('id')->all());
        $this->assertSame(100, $board[0]['fit_score']);
    }

    public function test_changing_the_job_requirements_scores_everyone_again(): void
    {
        $candidate = $this->candidate(['skills' => ['PHP', 'Laravel', 'Docker', 'Redis'], 'resume_text' => 'x', 'experience_years' => 6]);
        app(\App\Services\Recruitment\FitScoringService::class)->rescore($candidate);
        $this->assertSame(100, $candidate->fresh()->fit_score);

        $this->putJson("/api/v1/job-openings/{$this->job->id}", ['requirements' => 'Kubernetes and Redis. 10+ years of experience.'])->assertOk();

        // Redis matches, Kubernetes does not: skills 1/2 x 70 + 6/10 years x 30 = 53.
        $this->assertSame(53, $candidate->fresh()->fit_score);
    }

    public function test_a_scanned_resume_with_no_text_is_flagged_for_review_instead_of_silently_empty(): void
    {
        $candidate = $this->candidate();

        $scan = \Illuminate\Http\UploadedFile::fake()->createWithContent('scan.pdf', $this->pdfBytes(['']));
        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $scan])->assertOk()->assertJsonPath('data.resume_review_reason', 'no_text_layer');
        $this->assertNull($candidate->fresh()->fit_score);

        // A readable resume clears the flag.
        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk()->assertJsonPath('data.resume_review_reason', null);
    }

    public function test_a_readable_resume_with_no_details_found_is_flagged_and_email_delivery_is_reported(): void
    {
        $candidate = $this->candidate();
        $prose = array_fill(0, 6, 'This document describes a person who enjoys working with teams across many different projects');

        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $this->fakePdf($prose)])->assertOk()->assertJsonPath('data.resume_review_reason', 'no_details');

        // The test environment uses the array mailer, so staff are told nothing is really delivered.
        $this->getJson('/api/v1/recruitment/careers-settings')->assertOk()->assertJsonPath('data.email_delivery', false);
    }

    public function test_an_ocr_command_can_read_scanned_files_when_one_is_configured(): void
    {
        $script = tempnam(sys_get_temp_dir(), 'ocr') . '.php';
        file_put_contents($script, '<?php echo ' . var_export(implode("\n", $this->sampleCvLines()), true) . ';');
        config(['recruitment.ocr_command' => '"' . PHP_BINARY . '" "' . $script . '" {input}']);

        $parsed = app(ResumeParserService::class)->parseFile(tempnam(sys_get_temp_dir(), 'scan'), 'pdf');
        @unlink($script);

        $this->assertNull($parsed['review_reason']);
        $this->assertSame('ayesha.malik@example.com', $parsed['email']);
        $this->assertContains('Laravel', $parsed['skills']);
    }

    public function test_legacy_doc_text_in_both_8_bit_and_utf16_runs_is_recovered(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'doc');
        $wide = implode('', array_map(fn ($char) => $char . "\x00", str_split('Skilled in Laravel and Docker')));
        file_put_contents($path, "\xD0\xCF\x11\xE0" . random_bytes(32) . 'Experience: 7 years of PHP work' . "\x00\x00\x01" . $wide . "\x00\x00");

        $text = app(ResumeParserService::class)->extractText($path, 'doc');
        @unlink($path);

        $this->assertStringContainsString('7 years of PHP work', $text);
        $this->assertStringContainsString('Skilled in Laravel and Docker', $text);
    }

    public function test_talent_pool_suggestions_for_an_opening_are_ranked_and_respect_consent_and_expiry(): void
    {
        $match = $this->candidate(['email' => 'match@example.com', 'full_name' => 'Pool Match', 'stage' => 'rejected', 'talent_pool' => 'silver_medalist', 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'x', 'experience_years' => 6], $this->otherJob);
        $declined = $this->candidate(['email' => 'declined@example.com', 'full_name' => 'Said No', 'stage' => 'rejected', 'talent_pool' => 'general', 'pool_consent' => 'declined', 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'x', 'experience_years' => 6], $this->otherJob);
        $expired = $this->candidate(['email' => 'expired@example.com', 'full_name' => 'Lapsed', 'stage' => 'rejected', 'talent_pool' => 'general', 'talent_pool_expires_at' => now()->subDay(), 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'x', 'experience_years' => 6], $this->otherJob);
        $weak = $this->candidate(['email' => 'weak@example.com', 'full_name' => 'Weak', 'stage' => 'rejected', 'talent_pool' => 'general', 'skills' => ['Excel'], 'resume_text' => 'x', 'experience_years' => 1], $this->otherJob);
        $applied = $this->candidate(['email' => 'applied@example.com', 'full_name' => 'Already Here', 'talent_pool' => 'general', 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'x', 'experience_years' => 6]);
        $sameDifferentJob = $this->candidate(['email' => 'applied@example.com', 'full_name' => 'Already Here', 'stage' => 'rejected', 'talent_pool' => 'general', 'skills' => ['PHP'], 'resume_text' => 'x', 'experience_years' => 6], $this->otherJob);

        $rows = $this->getJson("/api/v1/job-openings/{$this->job->id}/suggested-candidates")->assertOk()->json('data');

        $this->assertSame([$match->id], collect($rows)->pluck('id')->all());
        $this->assertSame(100, $rows[0]['fit_score']);
        $this->assertSame('Platform Engineer', $rows[0]['previous_job_title']);
        $this->assertNotContains($declined->id, collect($rows)->pluck('id')->all());
        $this->assertNotContains($expired->id, collect($rows)->pluck('id')->all());
        $this->assertNotContains($weak->id, collect($rows)->pluck('id')->all());
        $this->assertNotContains($sameDifferentJob->id, collect($rows)->pluck('id')->all());
    }

    public function test_opening_a_job_tells_its_owner_when_the_pool_already_has_matches(): void
    {
        $this->candidate(['email' => 'match@example.com', 'full_name' => 'Pool Match', 'stage' => 'rejected', 'talent_pool' => 'silver_medalist', 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'x', 'experience_years' => 6], $this->otherJob);

        $created = $this->postJson('/api/v1/job-openings', [
            'title' => 'Senior Laravel Developer', 'requirements' => 'PHP, Laravel and Docker. 4+ years.', 'recruiter_id' => $this->recruiter->id,
        ])->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->recruiter->id, 'type' => 'recruitment_talent_pool',
        ]);
        $this->assertStringContainsString('1 talent pool candidates match', \App\Models\NotificationItem::where('type', 'recruitment_talent_pool')->value('title'));
        $this->assertSame('open', $created->json('data.status'));
    }

    public function test_csv_imported_people_are_scored_from_their_listed_skills(): void
    {
        $csv = "full_name,email,skills,experience_years\nAmna Khan,amna@example.com,\"PHP, Laravel, Docker\",6\nBilal Ahmed,bilal@example.com,,\n";
        $file = UploadedFile::fake()->createWithContent('people.csv', $csv);

        $this->post('/api/v1/candidates/import', ['job_opening_id' => $this->job->id, 'file' => $file], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.created', 2);

        $this->assertSame(100, Candidate::where('email', 'amna@example.com')->value('fit_score'));
        $this->assertNull(Candidate::where('email', 'bilal@example.com')->value('fit_score'));
    }

    // ---- duplicate merge ----------------------------------------------------------------

    public function test_duplicate_applications_can_be_merged_into_one_record(): void
    {
        Sanctum::actingAs($this->recruiter);

        $keep = $this->candidate(['tags' => ['laravel'], 'phone' => null, 'rating' => null]);
        $dupe = $this->candidate(['job_opening_id' => $this->otherJob->id, 'tags' => ['remote'], 'phone' => '0300 1234567', 'rating' => 4, 'skills' => ['Redis'], 'notes' => 'Prefers remote']);
        $interview = Interview::create(['candidate_id' => $dupe->id, 'company_id' => $this->company->id, 'interviewer_name' => 'Panel', 'interview_type' => 'technical', 'scheduled_at' => now()->addDay(), 'status' => 'scheduled']);
        $note = CandidateNote::create(['company_id' => $this->company->id, 'candidate_id' => $dupe->id, 'user_id' => $this->recruiter->id, 'body' => 'Great call']);

        $response = $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$dupe->id]])->assertOk();

        $this->assertDatabaseMissing('candidates', ['id' => $dupe->id]);
        $this->assertSame($keep->id, $interview->fresh()->candidate_id);
        $this->assertSame($keep->id, $note->fresh()->candidate_id);

        $merged = $keep->fresh();
        $this->assertEqualsCanonicalizing(['laravel', 'remote'], $merged->tags);
        $this->assertSame('0300 1234567', $merged->phone);
        $this->assertSame(4, $merged->rating);
        $this->assertSame(['Redis'], $merged->skills);
        $this->assertStringContainsString('Prefers remote', $merged->notes);
        $this->assertSame($dupe->id, $merged->merged_from[0]['id']);
        $this->assertSame('Platform Engineer', $merged->merged_from[0]['job_title']);
        $this->assertSame([], $response->json('data.duplicates'));
        $this->assertDatabaseHas('candidate_notes', ['candidate_id' => $keep->id, 'body' => 'Merged a duplicate application (Platform Engineer, applied stage) into this record.']);
    }

    public function test_only_real_duplicates_can_be_merged_and_hired_applications_stay(): void
    {
        $keep = $this->candidate();
        $stranger = $this->candidate(['email' => 'stranger@example.com', 'full_name' => 'Someone Else'], $this->otherJob);
        $hired = $this->candidate(['stage' => 'hired'], $this->otherJob);

        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$stranger->id]])->assertStatus(422)->assertJsonValidationErrors('merge_ids');
        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$hired->id]])->assertStatus(422)->assertJsonValidationErrors('merge_ids');
        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$keep->id]])->assertStatus(422);
        $this->assertDatabaseHas('candidates', ['id' => $stranger->id]);
        $this->assertDatabaseHas('candidates', ['id' => $hired->id]);
    }

    public function test_two_live_offers_block_a_merge_and_merging_needs_the_delete_permission(): void
    {
        $keep = $this->candidate();
        $dupe = $this->candidate(['email' => 'AYESHA.MALIK@example.com'], $this->otherJob);
        foreach ([$keep, $dupe] as $candidate) {
            \App\Models\Offer::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'salary' => 100, 'status' => 'sent']);
        }

        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$dupe->id]])->assertStatus(422)->assertJsonValidationErrors('merge_ids');

        Sanctum::actingAs($this->hrManager);
        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$dupe->id]])->assertForbidden();
    }

    public function test_merge_never_crosses_companies(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $foreignJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        $keep = $this->candidate();
        $foreign = Candidate::create(['job_opening_id' => $foreignJob->id, 'company_id' => $other->id, 'full_name' => 'Ayesha Malik', 'email' => 'ayesha.malik@example.com', 'stage' => 'applied']);

        $this->postJson("/api/v1/candidates/{$keep->id}/merge", ['merge_ids' => [$foreign->id]])->assertStatus(422);
        $this->assertDatabaseHas('candidates', ['id' => $foreign->id]);
    }
}
