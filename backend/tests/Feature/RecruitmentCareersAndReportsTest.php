<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use App\Models\Company;
use App\Models\Department;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\NotificationItem;
use App\Models\Offer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentCareersAndReportsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Department $department;

    private User $recruiter;

    private JobOpening $job;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->company = Company::create([
            'name' => 'Acme HR', 'careers_slug' => 'acme', 'careers_enabled' => true, 'careers_intro' => 'Join us!',
        ]);
        $this->grantLicense($this->company, ['recruitment']);
        $this->department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->job = $this->makeJob();
    }

    private function makeJob(array $overrides = []): JobOpening
    {
        return JobOpening::create(array_merge([
            'title' => 'Backend Engineer', 'department_id' => $this->department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 2, 'is_public' => true,
            'description' => 'Build APIs.', 'requirements' => '3+ years PHP', 'location' => 'Lahore',
            'salary_min' => 100000, 'salary_max' => 200000, 'salary_currency' => 'PKR',
        ], $overrides));
    }

    private function apply(string $slug = 'acme', ?int $jobId = null, array $overrides = [])
    {
        return $this->post("/api/v1/public/careers/{$slug}/jobs/" . ($jobId ?? $this->job->id) . '/apply', array_merge([
            'full_name' => 'Zara Applicant', 'email' => 'zara@example.com', 'phone' => '0300', 'cover_note' => 'Hello!',
            'resume' => UploadedFile::fake()->create('cv.pdf', 100, 'application/pdf'),
        ], $overrides), ['Accept' => 'application/json']);
    }

    // ---- public site ---------------------------------------------------------------

    public function test_public_profile_lists_only_open_public_jobs_without_internal_data(): void
    {
        $this->makeJob(['title' => 'Hidden role', 'is_public' => false]);
        $this->makeJob(['title' => 'Closed role', 'status' => 'closed']);
        $this->makeJob(['title' => 'Other company role', 'company_id' => Company::create(['name' => 'Other'])->id]);

        $response = $this->getJson('/api/v1/public/careers/acme')->assertOk();

        $response->assertJsonPath('data.company.name', 'Acme HR')
            ->assertJsonPath('data.company.intro', 'Join us!')
            ->assertJsonCount(1, 'data.jobs')
            ->assertJsonPath('data.jobs.0.title', 'Backend Engineer')
            ->assertJsonPath('data.jobs.0.department', 'Engineering');

        $body = $response->getContent();
        foreach (['hiring_manager', 'recruiter_id', 'company_id', 'open_positions', 'candidates'] as $internal) {
            $this->assertStringNotContainsString($internal, $body);
        }
    }

    public function test_public_job_detail_and_unavailable_pages(): void
    {
        $this->getJson("/api/v1/public/careers/acme/jobs/{$this->job->id}")
            ->assertOk()->assertJsonPath('data.job.requirements', '3+ years PHP')->assertJsonPath('data.job.description', 'Build APIs.');

        $hidden = $this->makeJob(['is_public' => false]);
        $this->getJson("/api/v1/public/careers/acme/jobs/{$hidden->id}")->assertNotFound();
        $this->getJson('/api/v1/public/careers/nope')->assertNotFound();

        $this->company->update(['careers_enabled' => false]);
        $this->getJson('/api/v1/public/careers/acme')->assertNotFound();
    }

    public function test_companies_without_a_recruitment_license_have_no_careers_page(): void
    {
        $unlicensed = Company::create(['name' => 'No License', 'careers_slug' => 'nolicense', 'careers_enabled' => true]);
        JobOpening::create(['title' => 'X', 'company_id' => $unlicensed->id, 'status' => 'open', 'is_public' => true, 'open_positions' => 1, 'employment_type' => 'full_time']);

        $this->getJson('/api/v1/public/careers/nolicense')->assertNotFound();
    }

    // ---- applying --------------------------------------------------------------------

    public function test_applying_creates_a_candidate_with_a_private_resume_history_and_notifies_the_team(): void
    {
        $this->apply()->assertCreated()->assertJsonPath('success', true);

        $candidate = Candidate::withoutGlobalScopes()->where('email', 'zara@example.com')->firstOrFail();
        $this->assertSame($this->company->id, $candidate->company_id);
        $this->assertSame($this->job->id, $candidate->job_opening_id);
        $this->assertSame('Careers page', $candidate->source);
        $this->assertSame('applied', $candidate->stage);
        $this->assertStringContainsString('Hello!', $candidate->notes);
        $this->assertTrue($candidate->has_resume);
        Storage::disk('local')->assertExists($candidate->resume_path);
        $this->assertSame(1, CandidateStageHistory::where('candidate_id', $candidate->id)->count());

        $notification = NotificationItem::where('user_id', $this->recruiter->id)->where('type', 'recruitment_candidate')->first();
        $this->assertNotNull($notification);
        $this->assertSame('/recruitment/candidates/' . $candidate->id, $notification->link);
    }

    public function test_job_owners_are_notified_instead_of_the_whole_team_when_set(): void
    {
        $manager = $this->createUserWithRole(User::ROLE_DEPARTMENT_MANAGER, ['company_id' => $this->company->id]);
        $this->job->update(['hiring_manager_id' => $manager->id]);

        $this->apply()->assertCreated();

        $this->assertSame(1, NotificationItem::where('user_id', $manager->id)->where('type', 'recruitment_candidate')->count());
        $this->assertSame(0, NotificationItem::where('user_id', $this->recruiter->id)->where('type', 'recruitment_candidate')->count());
    }

    public function test_application_input_is_validated(): void
    {
        $this->apply('acme', null, ['resume' => UploadedFile::fake()->create('cv.exe', 10)])->assertStatus(422)->assertJsonValidationErrors('resume');
        $this->apply('acme', null, ['resume' => UploadedFile::fake()->create('cv.pdf', 6000, 'application/pdf')])->assertStatus(422);
        $this->apply('acme', null, ['email' => 'not-an-email'])->assertStatus(422)->assertJsonValidationErrors('email');
        $this->apply('acme', null, ['full_name' => ''])->assertStatus(422);

        $this->assertSame(0, Candidate::withoutGlobalScopes()->count());
    }

    public function test_duplicate_applications_are_refused_and_bots_get_no_signal(): void
    {
        $this->apply()->assertCreated();
        $this->apply('acme', null, ['email' => 'ZARA@example.com'])->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertSame(1, Candidate::withoutGlobalScopes()->count());

        // A bot filling the hidden field is told it worked but nothing is stored.
        $this->apply('acme', null, ['email' => 'bot@example.com', 'website' => 'http://spam.example'])->assertCreated();
        $this->assertSame(0, Candidate::withoutGlobalScopes()->where('email', 'bot@example.com')->count());
    }

    public function test_cannot_apply_to_closed_private_or_foreign_jobs(): void
    {
        $closed = $this->makeJob(['status' => 'closed']);
        $private = $this->makeJob(['is_public' => false]);
        $otherCompany = Company::create(['name' => 'Other', 'careers_slug' => 'other', 'careers_enabled' => true]);
        $this->grantLicense($otherCompany, ['recruitment']);

        $this->apply('acme', $closed->id)->assertNotFound();
        $this->apply('acme', $private->id)->assertNotFound();
        $this->apply('other', $this->job->id)->assertNotFound(); // job belongs to a different company
        $this->assertSame(0, Candidate::withoutGlobalScopes()->count());
    }

    public function test_applications_are_rate_limited_per_visitor(): void
    {
        foreach (range(1, 6) as $i) {
            $this->apply('acme', null, ['email' => "user{$i}@example.com"])->assertCreated();
        }

        $this->apply('acme', null, ['email' => 'user7@example.com'])->assertStatus(429);
    }

    // ---- careers settings -----------------------------------------------------------------

    public function test_careers_settings_validation_permissions_and_uniqueness(): void
    {
        Sanctum::actingAs($this->recruiter);
        $this->getJson('/api/v1/recruitment/careers-settings')->assertOk()->assertJsonPath('data.slug', 'acme')->assertJsonPath('data.path', '/careers/acme');

        $this->putJson('/api/v1/recruitment/careers-settings', ['slug' => 'Bad Slug!'])->assertStatus(422)->assertJsonValidationErrors('slug');
        $this->putJson('/api/v1/recruitment/careers-settings', ['slug' => 'api'])->assertStatus(422)->assertJsonValidationErrors('slug');
        $this->putJson('/api/v1/recruitment/careers-settings', ['slug' => 'ab'])->assertStatus(422);

        Company::create(['name' => 'Taken', 'careers_slug' => 'taken']);
        $this->putJson('/api/v1/recruitment/careers-settings', ['slug' => 'taken'])->assertStatus(422)->assertJsonValidationErrors('slug');

        $this->putJson('/api/v1/recruitment/careers-settings', ['slug' => 'acme-hr', 'intro' => 'Welcome'])->assertOk()->assertJsonPath('data.path', '/careers/acme-hr');
        $this->putJson('/api/v1/recruitment/careers-settings', ['slug' => 'acme-hr'])->assertOk(); // keeping your own slug is fine
        $this->getJson('/api/v1/public/careers/acme')->assertNotFound();
        $this->getJson('/api/v1/public/careers/acme-hr')->assertOk();

        $hr = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        Sanctum::actingAs($hr);
        $this->getJson('/api/v1/recruitment/careers-settings')->assertOk();
        $this->putJson('/api/v1/recruitment/careers-settings', ['enabled' => false])->assertForbidden();
    }

    public function test_enabling_the_page_requires_a_slug(): void
    {
        $company = Company::create(['name' => 'Fresh']);
        $this->grantLicense($company, ['recruitment']);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $company->id]));

        $this->putJson('/api/v1/recruitment/careers-settings', ['enabled' => true])->assertStatus(422);
        $this->putJson('/api/v1/recruitment/careers-settings', ['enabled' => true, 'slug' => 'fresh-co'])->assertOk()->assertJsonPath('data.enabled', true);
    }

    // ---- job fields ------------------------------------------------------------------------

    public function test_job_owners_salary_range_and_public_flag_are_validated_and_counts_returned(): void
    {
        Sanctum::actingAs($this->recruiter);
        $stranger = User::factory()->create(['company_id' => Company::create(['name' => 'Other'])->id]);

        $this->postJson('/api/v1/job-openings', ['title' => 'X', 'hiring_manager_id' => $stranger->id])->assertStatus(422)->assertJsonValidationErrors('hiring_manager_id');
        $this->postJson('/api/v1/job-openings', ['title' => 'X', 'salary_min' => 500, 'salary_max' => 100])->assertStatus(422)->assertJsonValidationErrors('salary_max');

        $id = $this->postJson('/api/v1/job-openings', [
            'title' => 'QA Engineer', 'recruiter_id' => $this->recruiter->id, 'salary_min' => 100, 'salary_max' => 200,
            'salary_currency' => 'PKR', 'requirements' => 'Testing', 'is_public' => true,
        ])->assertCreated()->assertJsonPath('data.recruiter.name', $this->recruiter->name)->assertJsonPath('data.is_public', true)->json('data.id');

        $this->putJson("/api/v1/job-openings/{$id}", ['salary_min' => 300])->assertStatus(422)->assertJsonValidationErrors('salary_max');

        Candidate::create(['job_opening_id' => $id, 'company_id' => $this->company->id, 'full_name' => 'A', 'email' => 'a@example.com', 'stage' => 'hired']);
        Candidate::create(['job_opening_id' => $id, 'company_id' => $this->company->id, 'full_name' => 'B', 'email' => 'b@example.com', 'stage' => 'applied']);
        $row = collect($this->getJson('/api/v1/job-openings?per_page=50')->assertOk()->json('data.data'))->firstWhere('id', $id);
        $this->assertSame([2, 1], [$row['candidates_count'], $row['hired_count']]);
    }

    // ---- overview & analytics -----------------------------------------------------------------

    public function test_overview_reports_counts_and_attention_items(): void
    {
        Sanctum::actingAs($this->recruiter);
        $candidate = Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'A', 'email' => 'a@example.com', 'stage' => 'interview']);
        Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'B', 'email' => 'b@example.com', 'stage' => 'hired']);
        Offer::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'salary' => 1, 'status' => 'pending_approval']);
        Offer::create(['company_id' => $this->company->id, 'candidate_id' => $candidate->id, 'salary' => 1, 'status' => 'sent', 'expires_at' => now()->addDays(2)->toDateString()]);
        Interview::create(['candidate_id' => $candidate->id, 'company_id' => $this->company->id, 'interviewer_name' => 'X', 'scheduled_at' => now()->startOfWeek()->addHours(30)]);

        $data = $this->getJson('/api/v1/recruitment/overview')->assertOk()->json('data');

        $this->assertSame(1, $data['open_jobs']);
        $this->assertSame(1, $data['active_candidates']);
        $this->assertSame(2, $data['offers_pending']);
        $this->assertSame(1, $data['attention']['offers_awaiting_approval']);
        $this->assertSame(1, $data['attention']['offers_expiring_soon']);
        $this->assertSame(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'], array_column($data['pipeline'], 'stage'));
        $this->assertSame([0, 0, 1, 0, 1, 0], array_column($data['pipeline'], 'count'));
    }

    public function test_analytics_funnel_time_to_hire_sources_offers_and_rejections(): void
    {
        Sanctum::actingAs($this->recruiter);
        $make = fn (string $email, string $stage, ?string $source, int $daysAgo, ?string $reason = null) => Candidate::create([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => $email, 'email' => $email,
            'stage' => $stage, 'source' => $source, 'applied_at' => now()->subDays($daysAgo)->toDateString(), 'rejection_reason' => $reason,
        ]);
        $hired = $make('hired@example.com', 'hired', 'LinkedIn', 10);
        CandidateStageHistory::create(['company_id' => $this->company->id, 'candidate_id' => $hired->id, 'from_stage' => 'offer', 'to_stage' => 'hired']);
        $make('interview@example.com', 'interview', 'LinkedIn', 5);
        $make('applied@example.com', 'applied', null, 3);
        $make('rejected@example.com', 'rejected', 'Referral', 8, 'Not a fit');
        $make('rejected2@example.com', 'rejected', 'Referral', 8, 'Not a fit');
        $make('old@example.com', 'applied', 'Referral', 200); // outside the default 90-day window

        Offer::create(['company_id' => $this->company->id, 'candidate_id' => $hired->id, 'salary' => 1, 'status' => 'accepted']);
        Offer::create(['company_id' => $this->company->id, 'candidate_id' => $hired->id, 'salary' => 1, 'status' => 'declined']);
        Offer::create(['company_id' => $this->company->id, 'candidate_id' => $hired->id, 'salary' => 1, 'status' => 'draft']);

        $data = $this->getJson('/api/v1/recruitment/analytics')->assertOk()->json('data');

        $this->assertSame(5, $data['total_candidates']);
        $funnel = collect($data['funnel'])->keyBy('stage');
        // A candidate counts as having reached every stage up to their current one (hired => passed screening, interview, offer).
        $this->assertSame([5, 2, 2, 1, 1], [$funnel['applied']['count'], $funnel['screening']['count'], $funnel['interview']['count'], $funnel['offer']['count'], $funnel['hired']['count']]);
        $this->assertNull($funnel['applied']['conversion_from_previous']);
        $this->assertEquals([40.0, 100.0, 50.0, 100.0], [$funnel['screening']['conversion_from_previous'], $funnel['interview']['conversion_from_previous'], $funnel['offer']['conversion_from_previous'], $funnel['hired']['conversion_from_previous']]);

        $this->assertSame(1, $data['time_to_hire']['hires']);
        $this->assertEquals(10, $data['time_to_hire']['average_days']);

        $sources = collect($data['sources'])->keyBy('source');
        $this->assertSame([2, 1], [$sources['LinkedIn']['candidates'], $sources['LinkedIn']['hired']]);
        $this->assertEquals(50.0, $sources['LinkedIn']['hire_rate']);
        $this->assertSame(1, $sources['Unknown']['candidates']);
        $this->assertArrayNotHasKey('old@example.com', $sources->all());

        $this->assertSame([['reason' => 'Not a fit', 'count' => 2]], $data['rejection_reasons']);
        $this->assertSame(3, $data['offers']['total']);
        $this->assertEquals(50.0, $data['offers']['acceptance_rate']);

        $this->getJson('/api/v1/recruitment/analytics?from=2020-01-01&to=2030-01-01')->assertOk()->assertJsonPath('data.total_candidates', 6);
        $this->getJson('/api/v1/recruitment/analytics?from=2030-01-01&to=2020-01-01')->assertStatus(422);
    }

    public function test_analytics_and_overview_are_company_scoped_and_permission_protected(): void
    {
        Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'A', 'email' => 'a@example.com', 'stage' => 'applied', 'applied_at' => now()->toDateString()]);

        $other = Company::create(['name' => 'Other']);
        $this->grantLicense($other, ['recruitment']);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $other->id]));
        $this->getJson('/api/v1/recruitment/analytics')->assertOk()->assertJsonPath('data.total_candidates', 0);
        $this->getJson('/api/v1/recruitment/overview')->assertOk()->assertJsonPath('data.active_candidates', 0);

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]));
        $this->getJson('/api/v1/recruitment/analytics')->assertForbidden();
        $this->getJson('/api/v1/recruitment/overview')->assertForbidden();
    }

    public function test_people_picker_is_company_scoped_searchable_and_limited_to_active_employees_with_logins(): void
    {
        $make = fn (Company $company, string $name, string $status = 'active', bool $withUser = true) => \App\Models\Employee::create([
            'user_id' => $withUser ? User::factory()->create(['company_id' => $company->id])->id : null,
            'company_id' => $company->id, 'name' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@example.com',
            'department_id' => $this->department->id, 'designation' => 'Engineer', 'status' => $status, 'salary' => 1, 'basic_salary' => 1,
        ]);
        $make($this->company, 'Sara Manager');
        $make($this->company, 'Omar Inactive', 'inactive');
        $make(Company::create(['name' => 'Other']), 'Foreign Person');

        Sanctum::actingAs($this->recruiter);
        $names = fn (string $query = '') => collect($this->getJson('/api/v1/recruitment/people' . $query)->assertOk()->json('data'))->pluck('name')->all();

        $this->assertSame(['Sara Manager'], $names());
        $this->assertSame(['Sara Manager'], $names('?q=sara'));
        $this->assertSame([], $names('?q=zzz'));
        $first = $this->getJson('/api/v1/recruitment/people')->json('data.0');
        $this->assertEqualsCanonicalizing(['employee_id', 'user_id', 'name', 'email', 'designation', 'department'], array_keys($first));

        Sanctum::actingAs($this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]));
        $this->getJson('/api/v1/recruitment/people')->assertForbidden();
    }
}
