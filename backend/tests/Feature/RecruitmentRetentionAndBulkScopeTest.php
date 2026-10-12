<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateDocument;
use App\Models\CandidateNote;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\RecruitmentEmailTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsResumeFiles;
use Tests\TestCase;

class RecruitmentRetentionAndBulkScopeTest extends TestCase
{
    use BuildsResumeFiles;
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private JobOpening $job;

    private JobOpening $otherJob;

    /** @var array<int, array{to: string, subject: string, body: string}> */
    private array $mails = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) {
            $this->mails[] = ['to' => $event->message->getTo()[0]->getAddress(), 'subject' => $event->message->getSubject(), 'body' => $event->message->getTextBody()];
        });

        $this->company = Company::create(['name' => 'Acme HR', 'careers_slug' => 'acme']);
        $this->grantLicense($this->company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->job = JobOpening::create(['title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 5]);
        $this->otherJob = JobOpening::create(['title' => 'Platform Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        Sanctum::actingAs($this->recruiter);
    }

    private function candidate(array $overrides = [], ?JobOpening $job = null): Candidate
    {
        static $n = 0;
        $n++;

        return Candidate::create(array_merge([
            'job_opening_id' => ($job ?? $this->job)->id, 'company_id' => $this->company->id,
            'full_name' => "Candidate {$n}", 'email' => "candidate{$n}@example.com", 'stage' => 'applied',
        ], $overrides));
    }

    private function bulkInsert(int $count, string $companyId, int $jobId, array $overrides = []): void
    {
        $rows = [];

        for ($i = 0; $i < $count; $i++) {
            $rows[] = array_merge([
                'company_id' => $companyId, 'job_opening_id' => $jobId, 'full_name' => "Bulk {$i}", 'email' => "bulk{$i}-" . uniqid() . '@example.com',
                'stage' => 'applied', 'status' => 'active', 'applied_at' => now()->toDateString(), 'created_at' => now(), 'updated_at' => now(),
            ], $overrides);
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('candidates')->insert($chunk);
        }
    }

    private function token(Candidate $candidate): string
    {
        return $this->postJson("/api/v1/candidates/{$candidate->id}/portal-link")->assertOk()->json('data.token');
    }

    private function asGuest(): void
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
    }

    // ---- select everything matching a filter ------------------------------------------

    public function test_a_small_filter_wide_action_runs_immediately_and_respects_unticked_people(): void
    {
        $a = $this->candidate();
        $b = $this->candidate();
        $c = $this->candidate();
        $elsewhere = $this->candidate([], $this->otherJob);

        $response = $this->postJson('/api/v1/candidates/bulk', [
            'action' => 'tag', 'tags' => ['shortlist'],
            'select_all' => ['filters' => ['job_opening_id' => $this->job->id], 'exclude_ids' => [$b->id]],
        ])->assertOk();

        $this->assertEqualsCanonicalizing([$a->id, $c->id], $response->json('data.succeeded'));
        $this->assertNull($response->json('data.run'));
        $this->assertSame(['shortlist'], $a->fresh()->tags);
        $this->assertNull($b->fresh()->tags);
        $this->assertNull($elsewhere->fresh()->tags);
    }

    public function test_a_large_selection_beyond_200_runs_to_completion_and_reports_progress(): void
    {
        $this->bulkInsert(250, $this->company->id, $this->job->id);
        $other = Company::create(['name' => 'Other Co']);
        $foreignJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        $this->bulkInsert(5, $other->id, $foreignJob->id);

        $start = $this->postJson('/api/v1/candidates/bulk', [
            'action' => 'move', 'stage' => 'screening',
            'select_all' => ['filters' => ['stage' => 'applied'], 'exclude_ids' => []],
        ])->assertStatus(202);

        $runId = $start->json('data.run.id');
        $this->assertSame(250, $start->json('data.run.total'));

        // The work finishes right after the response, so the run is already done when we ask.
        $run = $this->getJson("/api/v1/candidates/bulk-runs/{$runId}")->assertOk();
        $run->assertJsonPath('data.status', 'done')->assertJsonPath('data.processed', 250)->assertJsonPath('data.succeeded', 250)->assertJsonPath('data.failed_count', 0);

        $this->assertSame(250, Candidate::where('company_id', $this->company->id)->where('stage', 'screening')->count());
        $this->assertSame(5, DB::table('candidates')->where('company_id', $other->id)->where('stage', 'applied')->count());
        $this->assertSame(250, DB::table('candidate_stage_histories')->where('to_stage', 'screening')->count());

        // Nobody else can follow someone else's run.
        $second = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        Sanctum::actingAs($second);
        $this->getJson("/api/v1/candidates/bulk-runs/{$runId}")->assertNotFound();
    }

    public function test_failures_in_a_large_run_are_listed_without_stopping_it(): void
    {
        $this->bulkInsert(205, $this->company->id, $this->job->id);
        // Candidates already in screening cannot be moved to screening again via the transition rules? They can (same stage), so use offer.
        $this->bulkInsert(3, $this->company->id, $this->job->id, ['stage' => 'offer']);

        $start = $this->postJson('/api/v1/candidates/bulk', [
            'action' => 'move', 'stage' => 'screening',
            'select_all' => ['filters' => ['job_opening_id' => $this->job->id]],
        ])->assertStatus(202);

        $run = $this->getJson('/api/v1/candidates/bulk-runs/' . $start->json('data.run.id'))->assertOk();
        $run->assertJsonPath('data.status', 'done')->assertJsonPath('data.processed', 208)->assertJsonPath('data.succeeded', 205)->assertJsonPath('data.failed_count', 3);
        $this->assertCount(3, $run->json('data.failed'));
        $this->assertStringContainsString('Invalid candidate stage transition', $run->json('data.failed.0.reason'));
    }

    public function test_filter_wide_actions_have_limits_and_need_something_to_match(): void
    {
        $this->postJson('/api/v1/candidates/bulk', ['action' => 'tag', 'tags' => ['x'], 'select_all' => ['filters' => ['stage' => 'applied']]])->assertStatus(422)->assertJsonValidationErrors('filters');

        $this->bulkInsert(501, $this->company->id, $this->job->id);
        $this->postJson('/api/v1/candidates/bulk', ['action' => 'email', 'subject' => 'Hi', 'body' => 'Hello', 'select_all' => ['filters' => ['stage' => 'applied']]])
            ->assertStatus(422)->assertJsonValidationErrors('filters');

        $this->postJson('/api/v1/candidates/bulk', ['action' => 'tag', 'tags' => ['x']])->assertStatus(422);
    }

    public function test_the_filter_wide_selection_uses_the_same_filters_as_the_list(): void
    {
        $match = $this->candidate(['skills' => ['Laravel'], 'tags' => ['a']]);
        $miss = $this->candidate(['skills' => ['Excel']]);

        $listed = collect($this->getJson('/api/v1/candidates?skill=Laravel')->json('data.data'))->pluck('id')->all();
        $this->assertSame([$match->id], $listed);

        $this->postJson('/api/v1/candidates/bulk', ['action' => 'tag', 'tags' => ['picked'], 'select_all' => ['filters' => ['skill' => 'Laravel']]])->assertOk();
        $this->assertContains('picked', $match->fresh()->tags);
        $this->assertNull($miss->fresh()->tags);
    }

    // ---- email templates ----------------------------------------------------------------

    public function test_email_templates_are_saved_per_company_and_starters_are_added_once(): void
    {
        $this->postJson('/api/v1/email-templates', ['name' => 'Offer follow-up', 'subject' => 'About {{job}}', 'body' => 'Hi {{first_name}}'])->assertCreated();
        $this->postJson('/api/v1/email-templates', ['name' => '', 'subject' => 'x', 'body' => 'y'])->assertStatus(422);

        $this->postJson('/api/v1/email-templates/starters')->assertCreated();
        $this->postJson('/api/v1/email-templates/starters')->assertCreated();
        $names = collect($this->getJson('/api/v1/email-templates')->assertOk()->json('data'))->pluck('name');
        $this->assertCount(6, $names);
        $this->assertSame(1, $names->filter(fn ($name) => $name === 'Application received')->count());

        $id = RecruitmentEmailTemplate::where('name', 'Offer follow-up')->value('id');
        $this->putJson("/api/v1/email-templates/{$id}", ['name' => 'Offer follow-up', 'subject' => 'Changed', 'body' => 'Body'])->assertOk()->assertJsonPath('data.subject', 'Changed');

        $other = Company::create(['name' => 'Other Co']);
        $this->grantLicense($other, ['recruitment']);
        $stranger = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $other->id]);
        Sanctum::actingAs($stranger);
        $this->assertCount(0, $this->getJson('/api/v1/email-templates')->json('data'));
        $this->putJson("/api/v1/email-templates/{$id}", ['name' => 'x', 'subject' => 'x', 'body' => 'x'])->assertForbidden();
        $this->deleteJson("/api/v1/email-templates/{$id}")->assertForbidden();

        Sanctum::actingAs($this->recruiter);
        $this->deleteJson("/api/v1/email-templates/{$id}")->assertOk();
        $this->assertNull(RecruitmentEmailTemplate::find($id));
    }

    public function test_a_template_with_placeholders_is_filled_in_per_candidate_when_emailed(): void
    {
        $a = $this->candidate(['full_name' => 'Amna Khan']);
        $b = $this->candidate(['full_name' => 'Bilal Raza']);

        $this->postJson('/api/v1/candidates/bulk', ['ids' => [$a->id, $b->id], 'action' => 'email', 'subject' => 'Update on {{job}}', 'body' => 'Hello {{first_name}}, from {{company}}.'])->assertOk()->assertJsonCount(2, 'data.succeeded');

        $this->assertSame('Update on Backend Engineer', $this->mails[0]['subject']);
        $this->assertStringContainsString('Hello Amna, from Acme HR.', $this->mails[0]['body']);
        $this->assertStringContainsString('Hello Bilal, from Acme HR.', $this->mails[1]['body']);
    }

    // ---- talent pool consent and retention -----------------------------------------------

    public function test_joining_the_pool_starts_the_retention_clock_from_the_company_setting(): void
    {
        $candidate = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x']);

        $this->postJson("/api/v1/candidates/{$candidate->id}/talent-pool", ['pool' => 'silver_medalist'])->assertOk();
        $candidate->refresh();
        $this->assertSame('unconfirmed', $candidate->pool_consent);
        $this->assertEqualsWithDelta(now()->addMonths(12)->timestamp, $candidate->talent_pool_expires_at->timestamp, 120);

        $this->company->update(['talent_pool_retention_months' => 3]);
        $second = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x']);
        $this->postJson("/api/v1/candidates/{$second->id}/talent-pool", ['pool' => 'general'])->assertOk();
        $this->assertEqualsWithDelta(now()->addMonths(3)->timestamp, $second->fresh()->talent_pool_expires_at->timestamp, 120);

        $this->company->update(['talent_pool_retention_months' => null]);
        $third = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x']);
        $this->postJson("/api/v1/candidates/{$third->id}/talent-pool", ['pool' => 'general'])->assertOk();
        $this->assertNull($third->fresh()->talent_pool_expires_at);

        $this->deleteJson("/api/v1/candidates/{$candidate->id}/talent-pool")->assertOk();
        $this->assertNull($candidate->fresh()->talent_pool_expires_at);
    }

    public function test_a_candidate_can_agree_or_refuse_to_stay_on_file(): void
    {
        $yes = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'silver_medalist', 'talent_pool_expires_at' => now()->addDays(10)]);
        $no = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'general']);
        $notInPool = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x']);

        $this->postJson("/api/v1/candidates/{$notInPool->id}/talent-pool/consent-request")->assertStatus(422);

        $this->postJson("/api/v1/candidates/{$yes->id}/talent-pool/consent-request")->assertOk();
        $this->assertSame('pending', $yes->fresh()->pool_consent);
        $this->assertNotNull($yes->fresh()->pool_consent_requested_at);
        preg_match('#/candidate-portal/([A-Za-z0-9]{48})#', end($this->mails)['body'], $link);
        $this->assertStringContainsString('keep your details on file', end($this->mails)['body']);

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$link[1]}")->assertJsonPath('data.talent_pool.status', 'pending')->assertJsonPath('data.talent_pool.can_respond', true);
        $this->postJson("/api/v1/public/portal/{$link[1]}/talent-pool", ['consent' => true])->assertOk()->assertJsonPath('data.talent_pool.status', 'granted');
        $this->assertEqualsWithDelta(now()->addMonths(12)->timestamp, $yes->fresh()->talent_pool_expires_at->timestamp, 120);

        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/candidates/{$no->id}/talent-pool/consent-request")->assertOk();
        preg_match('#/candidate-portal/([A-Za-z0-9]{48})#', end($this->mails)['body'], $noLink);

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$noLink[1]}/talent-pool", ['consent' => false])->assertOk()->assertJsonPath('data.talent_pool.status', 'declined')->assertJsonPath('data.talent_pool.can_respond', false);

        $no->refresh();
        $this->assertNull($no->talent_pool);
        $this->assertSame('declined', $no->pool_consent);

        // Refusal is binding: no pool, no being put forward.
        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/candidates/{$no->id}/talent-pool", ['pool' => 'general'])->assertStatus(422)->assertJsonValidationErrors('pool');
        $this->postJson("/api/v1/candidates/{$no->id}/consider", ['job_opening_id' => $this->otherJob->id])->assertStatus(422);
        $this->postJson("/api/v1/candidates/bulk", ['ids' => [$no->id], 'action' => 'talent_pool', 'pool' => 'general'])->assertOk()->assertJsonCount(1, 'data.failed');
    }

    public function test_the_retention_command_lets_expired_entries_lapse_and_warns_about_the_ones_about_to(): void
    {
        $expired = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'general', 'talent_pool_expires_at' => now()->subHour()]);
        $soon = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'general', 'talent_pool_expires_at' => now()->addDays(14)->subHours(2)]);
        $later = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'general', 'talent_pool_expires_at' => now()->addMonths(5)]);
        $forever = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'general']);

        $this->artisan('recruitment:apply-retention')->assertSuccessful();

        $this->assertNull($expired->fresh()->talent_pool);
        $this->assertNull($expired->fresh()->talent_pool_expires_at);
        $this->assertDatabaseHas('candidate_notes', ['candidate_id' => $expired->id, 'body' => 'Left the talent pool because the retention period ended.']);
        $this->assertSame('general', $soon->fresh()->talent_pool);
        $this->assertSame('general', $later->fresh()->talent_pool);
        $this->assertSame('general', $forever->fresh()->talent_pool);
        $this->assertDatabaseHas('notifications', ['user_id' => $this->recruiter->id, 'type' => 'recruitment_talent_pool', 'title' => '1 talent pool entries expire soon']);
    }

    public function test_old_rejected_candidates_are_erased_only_when_the_company_sets_a_retention_period(): void
    {
        $old = $this->candidate(['full_name' => 'Old Reject', 'email' => 'old@example.com', 'phone' => '0300 1111111', 'stage' => 'rejected', 'rejection_reason' => 'Not a fit', 'notes' => 'private', 'resume_path' => 'recruitment/resumes/x.pdf']);
        Storage::disk('local')->put('recruitment/resumes/x.pdf', 'data');
        CandidateNote::create(['company_id' => $this->company->id, 'candidate_id' => $old->id, 'user_id' => $this->recruiter->id, 'body' => 'Rude on the phone']);
        $document = CandidateDocument::create(['company_id' => $this->company->id, 'candidate_id' => $old->id, 'label' => 'ID', 'status' => 'uploaded', 'file_path' => 'recruitment/documents/id.pdf']);
        Storage::disk('local')->put('recruitment/documents/id.pdf', 'data');
        $recent = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x']);
        $pooled = $this->candidate(['stage' => 'rejected', 'rejection_reason' => 'x', 'talent_pool' => 'general', 'talent_pool_expires_at' => now()->addYear()]);
        $hired = $this->candidate(['stage' => 'hired']);
        $active = $this->candidate(['stage' => 'screening']);
        DB::table('candidates')->whereIn('id', [$old->id, $pooled->id, $hired->id, $active->id])->update(['updated_at' => now()->subMonths(30)]);

        $this->artisan('recruitment:apply-retention')->assertSuccessful();
        $this->assertSame('Old Reject', $old->fresh()->full_name);

        $this->company->update(['candidate_retention_months' => 24]);
        $this->artisan('recruitment:apply-retention')->assertSuccessful();

        $old->refresh();
        $this->assertSame('Former candidate #' . $old->id, $old->full_name);
        $this->assertSame('erased-' . $old->id . '@erased.invalid', $old->email);
        $this->assertNull($old->phone);
        $this->assertNull($old->notes);
        $this->assertNull($old->rejection_reason);
        $this->assertNull($old->resume_path);
        $this->assertNotNull($old->anonymized_at);
        $this->assertSame('rejected', $old->stage);
        Storage::disk('local')->assertMissing('recruitment/resumes/x.pdf');
        Storage::disk('local')->assertMissing('recruitment/documents/id.pdf');
        $this->assertNull(CandidateDocument::find($document->id));
        $this->assertSame(0, CandidateNote::where('candidate_id', $old->id)->count());

        $this->assertNull($recent->fresh()->anonymized_at);
        $this->assertNull($pooled->fresh()->anonymized_at);
        $this->assertNull($hired->fresh()->anonymized_at);
        $this->assertNull($active->fresh()->anonymized_at);
    }

    public function test_a_recruiter_or_the_candidate_can_erase_a_record_on_request(): void
    {
        $viewer = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $person = $this->candidate(['full_name' => 'Forget Me', 'stage' => 'screening']);
        $token = $this->token($person);

        Sanctum::actingAs($viewer);
        $this->postJson("/api/v1/candidates/{$person->id}/erase")->assertForbidden();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/erase", [])->assertStatus(422);
        $this->postJson("/api/v1/public/portal/{$token}/erase", ['confirm' => true])->assertOk();

        $this->assertNotNull($person->fresh()->anonymized_at);
        $this->assertSame('Former candidate #' . $person->id, $person->fresh()->full_name);
        $this->getJson("/api/v1/public/portal/{$token}")->assertNotFound();

        Sanctum::actingAs($this->recruiter);
        $hired = $this->candidate(['stage' => 'hired']);
        $this->postJson("/api/v1/candidates/{$hired->id}/erase")->assertStatus(422);

        $target = $this->candidate(['full_name' => 'Delete Me']);
        $this->postJson("/api/v1/candidates/{$target->id}/erase")->assertOk()->assertJsonPath('data.full_name', 'Former candidate #' . $target->id);
    }
}
