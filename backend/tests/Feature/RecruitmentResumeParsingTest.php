<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\User;
use App\Services\Recruitment\ResumeParserService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsResumeFiles;
use Tests\TestCase;

class RecruitmentResumeParsingTest extends TestCase
{
    use BuildsResumeFiles;
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
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1,
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function candidate(array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id,
            'full_name' => 'Ayesha Malik', 'email' => 'ayesha.malik@example.com',
        ], $overrides));
    }

    // ---- parser -------------------------------------------------------------------

    public function test_parser_reads_contact_details_skills_and_stated_experience(): void
    {
        $parsed = app(ResumeParserService::class)->parseText(implode("\n", $this->sampleCvLines()));

        $this->assertSame('Ayesha Malik', $parsed['name']);
        $this->assertSame('ayesha.malik@example.com', $parsed['email']);
        $this->assertSame('+92 300 1234567', $parsed['phone']);
        $this->assertEqualsCanonicalizing(['PHP', 'Laravel', 'MySQL', 'Docker', 'Kubernetes', 'Redis'], array_intersect($parsed['skills'], ['PHP', 'Laravel', 'MySQL', 'Docker', 'Kubernetes', 'Redis']));
        $this->assertSame(6.0, $parsed['experience_years']);
    }

    public function test_parser_estimates_experience_from_date_ranges_without_double_counting(): void
    {
        $text = "John Smith\nEngineer\nJan 2015 - Dec 2017\nJun 2016 - Dec 2018\n2019 - 2020";

        $years = app(ResumeParserService::class)->parseText($text)['experience_years'];

        // Jan 2015 → Dec 2018 (overlap counted once) plus 2019 → 2020 = 70 months.
        $this->assertEqualsWithDelta(5.8, $years, 0.2);
    }

    public function test_parser_does_not_mistake_years_or_everyday_words_for_phones_and_skills(): void
    {
        $parsed = app(ResumeParserService::class)->parseText("Sara Khan\nWorked from 2018 - 2022 and will go to the express line\nI like to excel at rust removal");

        $this->assertNull($parsed['phone']);
        $this->assertNotContains('Go', $parsed['skills']);
        $this->assertNotContains('Excel', $parsed['skills']);
        $this->assertNotContains('Rust', $parsed['skills']);
        $this->assertNull($parsed['email']);
    }

    public function test_parser_reads_real_pdf_and_docx_files_and_survives_garbage(): void
    {
        $parser = app(ResumeParserService::class);

        $pdf = $this->fakePdf($this->sampleCvLines());
        $fromPdf = $parser->parseFile($pdf->getRealPath(), 'pdf');
        $this->assertSame('ayesha.malik@example.com', $fromPdf['email']);
        $this->assertContains('Laravel', $fromPdf['skills']);

        $docx = $this->fakeDocx($this->sampleCvLines('Bilal Ahmed'));
        $fromDocx = $parser->parseFile($docx->getRealPath(), 'docx');
        $this->assertSame('Bilal Ahmed', $fromDocx['name']);
        $this->assertContains('Docker', $fromDocx['skills']);

        $junk = tempnam(sys_get_temp_dir(), 'cv');
        file_put_contents($junk, random_bytes(512));
        $empty = $parser->parseFile($junk, 'pdf');
        $this->assertSame('', $empty['text']);
        $this->assertSame([], $empty['skills']);
        $this->assertNull($parser->parseFile($junk, 'docx')['email']);
        @unlink($junk);
    }

    // ---- API ----------------------------------------------------------------------

    public function test_uploading_a_resume_fills_skills_experience_and_missing_phone_only(): void
    {
        $blank = $this->candidate();
        $this->postJson("/api/v1/candidates/{$blank->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();

        $blank->refresh();
        $this->assertSame('+92 300 1234567', $blank->phone);
        $this->assertContains('Laravel', $blank->skills);
        $this->assertSame(6.0, $blank->experience_years);
        $this->assertSame('ayesha.malik@example.com', $blank->resume_parsed['email']);
        $this->assertSame('Ayesha Malik', $blank->full_name);

        $existing = $this->candidate(['email' => 'other@example.com', 'phone' => '0311 0000000', 'full_name' => 'Typed Name']);
        $this->postJson("/api/v1/candidates/{$existing->id}/resume", ['resume' => $this->fakeDocx($this->sampleCvLines())])->assertOk();

        $existing->refresh();
        $this->assertSame('0311 0000000', $existing->phone, 'a recruiter-entered phone must not be overwritten');
        $this->assertSame('Typed Name', $existing->full_name);
        $this->assertContains('MySQL', $existing->skills);

        // The raw text never leaves the server.
        $this->getJson("/api/v1/candidates/{$existing->id}")->assertOk()->assertJsonMissingPath('data.resume_text');
    }

    public function test_an_unreadable_resume_is_still_stored(): void
    {
        $candidate = $this->candidate();
        $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('scan.pdf', random_bytes(300));

        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $file])->assertOk();

        $this->assertTrue($candidate->fresh()->has_resume);
        $this->assertNull($candidate->fresh()->skills);
    }

    public function test_deleting_the_resume_clears_what_was_parsed(): void
    {
        $candidate = $this->candidate();
        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();
        $this->assertNotEmpty($candidate->fresh()->skills);

        $this->deleteJson("/api/v1/candidates/{$candidate->id}/resume")->assertOk();

        $fresh = $candidate->fresh();
        $this->assertNull($fresh->skills);
        $this->assertNull($fresh->resume_text);
        $this->assertNull($fresh->experience_years);
    }

    public function test_parse_endpoint_returns_details_for_the_add_form_without_storing_anything(): void
    {
        $this->post('/api/v1/recruitment/resume-parse', ['resume' => $this->fakePdf($this->sampleCvLines())], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Ayesha Malik')
            ->assertJsonPath('data.email', 'ayesha.malik@example.com')
            ->assertJsonPath('data.experience_years', 6)
            ->assertJsonMissingPath('data.text');

        $this->assertSame(0, Candidate::count());
        $this->post('/api/v1/recruitment/resume-parse', ['resume' => \Illuminate\Http\UploadedFile::fake()->create('x.exe', 10)], ['Accept' => 'application/json'])->assertStatus(422);

        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);
        $this->post('/api/v1/recruitment/resume-parse', ['resume' => $this->fakePdf($this->sampleCvLines())], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_reparse_reads_the_stored_file_again(): void
    {
        $candidate = $this->candidate();
        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();
        $candidate->update(['skills' => ['Old'], 'experience_years' => 1]);

        $this->postJson("/api/v1/candidates/{$candidate->id}/resume/parse")->assertOk();

        $this->assertContains('Laravel', $candidate->fresh()->skills);
        $this->assertSame(6.0, $candidate->fresh()->experience_years);

        $noCv = $this->candidate(['email' => 'nocv@example.com']);
        $this->postJson("/api/v1/candidates/{$noCv->id}/resume/parse")->assertStatus(422);
    }

    // ---- searching resumes --------------------------------------------------------

    public function test_keyword_search_matches_resume_text_skills_and_requires_every_keyword(): void
    {
        $laravel = $this->candidate();
        $this->postJson("/api/v1/candidates/{$laravel->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();

        $python = $this->candidate(['email' => 'py@example.com', 'full_name' => 'Pyth On']);
        $this->postJson("/api/v1/candidates/{$python->id}/resume", ['resume' => $this->fakeDocx(['Pyth On', 'Skills', 'Python, Django, PostgreSQL', '2+ years of experience in data work'])])->assertOk();

        $this->candidate(['email' => 'none@example.com', 'full_name' => 'No Resume']);

        $hit = $this->getJson('/api/v1/candidates?resume_q=laravel')->assertOk();
        $hit->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $laravel->id);
        $this->assertStringContainsStringIgnoringCase('laravel', $hit->json('data.data.0.resume_snippet'));

        $this->getJson('/api/v1/candidates?resume_q=laravel+kubernetes')->assertJsonCount(1, 'data.data');
        $this->getJson('/api/v1/candidates?resume_q=laravel+django')->assertJsonCount(0, 'data.data');
        $this->getJson('/api/v1/candidates?resume_q=' . urlencode('"building web platforms"'))->assertJsonCount(1, 'data.data');
        $this->getJson('/api/v1/candidates?resume_q=postgresql')->assertJsonPath('data.data.0.id', $python->id);

        // Wildcard characters are not interpreted: "lar%vel" does not match "laravel".
        $this->getJson('/api/v1/candidates?resume_q=' . urlencode('lar%vel'))->assertJsonCount(0, 'data.data');
    }

    public function test_skill_and_experience_filters(): void
    {
        $senior = $this->candidate();
        $this->postJson("/api/v1/candidates/{$senior->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();
        $junior = $this->candidate(['email' => 'jr@example.com', 'full_name' => 'Jun Ior', 'skills' => ['PHP'], 'experience_years' => 1]);

        $this->getJson('/api/v1/candidates?skill=PHP')->assertJsonCount(2, 'data.data');
        $this->getJson('/api/v1/candidates?skill=Kubernetes')->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $senior->id);
        $this->getJson('/api/v1/candidates?min_experience=5')->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $senior->id);
        $this->getJson('/api/v1/candidates?skill=PHP&min_experience=0.5')->assertJsonCount(2, 'data.data');
    }

    public function test_resume_search_never_crosses_companies(): void
    {
        $mine = $this->candidate();
        $this->postJson("/api/v1/candidates/{$mine->id}/resume", ['resume' => $this->fakePdf($this->sampleCvLines())])->assertOk();

        $other = Company::create(['name' => 'Other Co']);
        $this->grantLicense($other, ['recruitment']);
        $otherJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        Candidate::create(['job_opening_id' => $otherJob->id, 'company_id' => $other->id, 'full_name' => 'Rival Person', 'email' => 'rival@example.com', 'resume_text' => 'laravel expert', 'skills' => ['Laravel']]);

        $this->getJson('/api/v1/candidates?resume_q=laravel')->assertJsonCount(1, 'data.data');
        $this->getJson('/api/v1/candidates?skill=Laravel')->assertJsonCount(1, 'data.data');
    }
}
