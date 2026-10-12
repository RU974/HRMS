<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentBulkActionsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private JobOpening $job;

    protected function setUp(): void
    {
        parent::setUp();

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

    private function candidate(string $name, string $stage = 'applied', array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => $name,
            'email' => strtolower(str_replace(' ', '.', $name)) . '@example.com', 'stage' => $stage,
        ], $overrides));
    }

    private function bulk(array $payload)
    {
        return $this->postJson('/api/v1/candidates/bulk', $payload);
    }

    // ---- bulk actions -------------------------------------------------------------

    public function test_move_advances_valid_candidates_and_reports_the_ones_that_cannot_move(): void
    {
        $a = $this->candidate('Amna One');
        $b = $this->candidate('Bilal Two');
        $c = $this->candidate('Chand Three', 'offer');

        $response = $this->bulk(['ids' => [$a->id, $b->id, $c->id, 99999], 'action' => 'move', 'stage' => 'screening'])->assertOk();

        $this->assertEqualsCanonicalizing([$a->id, $b->id], $response->json('data.succeeded'));
        $this->assertSame(2, count($response->json('data.failed')));
        $this->assertSame('screening', $a->fresh()->stage);
        $this->assertSame('offer', $c->fresh()->stage);
        $this->assertDatabaseHas('candidate_stage_histories', ['candidate_id' => $a->id, 'to_stage' => 'screening']);
        $this->assertStringContainsString('Invalid candidate stage transition', collect($response->json('data.failed'))->firstWhere('id', $c->id)['reason']);
        $this->assertSame('Candidate not found.', collect($response->json('data.failed'))->firstWhere('id', 99999)['reason']);

        // Hired is never reachable in bulk, and rejection needs the reject action (and a reason).
        $this->bulk(['ids' => [$a->id], 'action' => 'move', 'stage' => 'hired'])->assertOk()->assertJsonCount(0, 'data.succeeded');
        $this->bulk(['ids' => [$a->id], 'action' => 'move', 'stage' => 'rejected'])->assertOk()->assertJsonCount(0, 'data.succeeded');
        $this->bulk(['ids' => [$a->id], 'action' => 'reject'])->assertStatus(422)->assertJsonValidationErrors('reason');
    }

    public function test_reject_records_the_reason_withdraws_offers_and_can_keep_them_in_the_pool(): void
    {
        $a = $this->candidate('Amna One', 'screening');
        $b = $this->candidate('Bilal Two', 'hired');

        $response = $this->bulk(['ids' => [$a->id, $b->id], 'action' => 'reject', 'reason' => 'Role filled', 'talent_pool' => 'silver_medalist'])->assertOk();

        $this->assertSame([$a->id], $response->json('data.succeeded'));
        $this->assertSame($b->id, $response->json('data.failed.0.id'));
        $a->refresh();
        $this->assertSame('rejected', $a->stage);
        $this->assertSame('Role filled', $a->rejection_reason);
        $this->assertSame('silver_medalist', $a->talent_pool);
        $this->assertSame('hired', $b->fresh()->stage);
    }

    public function test_tag_and_untag_merge_without_duplicates_and_respect_the_limit(): void
    {
        $a = $this->candidate('Amna One', 'applied', ['tags' => ['remote']]);
        $b = $this->candidate('Bilal Two');
        $full = $this->candidate('Full Tags', 'applied', ['tags' => array_map(fn ($i) => "t{$i}", range(1, 20))]);

        $response = $this->bulk(['ids' => [$a->id, $b->id, $full->id], 'action' => 'tag', 'tags' => ['remote', 'urgent']])->assertOk();

        $this->assertEqualsCanonicalizing([$a->id, $b->id], $response->json('data.succeeded'));
        $this->assertSame($full->id, $response->json('data.failed.0.id'));
        $this->assertEqualsCanonicalizing(['remote', 'urgent'], $a->fresh()->tags);
        $this->assertEqualsCanonicalizing(['remote', 'urgent'], $b->fresh()->tags);

        $this->bulk(['ids' => [$a->id, $b->id], 'action' => 'untag', 'tags' => ['urgent']])->assertOk();
        $this->assertSame(['remote'], $a->fresh()->tags);
        $this->assertSame(['remote'], $b->fresh()->tags);

        $this->bulk(['ids' => [$a->id], 'action' => 'tag'])->assertStatus(422)->assertJsonValidationErrors('tags');
    }

    public function test_pool_actions(): void
    {
        $a = $this->candidate('Amna One', 'rejected', ['rejection_reason' => 'x']);

        $this->bulk(['ids' => [$a->id], 'action' => 'talent_pool', 'pool' => 'general', 'note' => 'Keep warm'])->assertOk()->assertJsonCount(1, 'data.succeeded');
        $this->assertSame('general', $a->fresh()->talent_pool);

        $this->bulk(['ids' => [$a->id], 'action' => 'remove_from_pool'])->assertOk();
        $this->assertNull($a->fresh()->talent_pool);
    }

    public function test_email_logs_a_note_and_validates_its_content(): void
    {
        $a = $this->candidate('Amna Khan');
        $b = $this->candidate('Bilal Two');

        $response = $this->bulk([
            'ids' => [$a->id, $b->id], 'action' => 'email',
            'subject' => 'Update on {{job}}', 'body' => "Hi {{first_name}},\nThanks for applying to {{company}}.",
        ])->assertOk();

        $this->assertCount(2, $response->json('data.succeeded'));
        $this->assertDatabaseHas('candidate_notes', ['candidate_id' => $a->id, 'body' => 'Emailed the candidate: Update on Backend Engineer']);
        $this->assertDatabaseHas('candidate_notes', ['candidate_id' => $b->id]);

        $this->bulk(['ids' => [$a->id], 'action' => 'email', 'subject' => 'Hello'])->assertStatus(422)->assertJsonValidationErrors('body');
    }

    public function test_email_text_is_personalised_per_candidate(): void
    {
        $captured = [];
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) use (&$captured) {
            $captured[] = [
                'to' => $event->message->getTo()[0]->getAddress(),
                'subject' => $event->message->getSubject(),
                'body' => $event->message->getTextBody(),
            ];
        });

        $a = $this->candidate('Amna Khan');
        $this->bulk(['ids' => [$a->id], 'action' => 'email', 'subject' => 'Update on {{job}}', 'body' => 'Hi {{first_name}}, welcome to {{company}}.'])->assertOk();

        $this->assertCount(1, $captured);
        $this->assertSame('amna.khan@example.com', $captured[0]['to']);
        $this->assertSame('Update on Backend Engineer', $captured[0]['subject']);
        $this->assertStringContainsString('Hi Amna, welcome to Acme HR.', $captured[0]['body']);
    }

    public function test_limits_validation_and_permissions(): void
    {
        $this->bulk(['ids' => [], 'action' => 'move', 'stage' => 'screening'])->assertStatus(422);
        $this->bulk(['ids' => range(1, 201), 'action' => 'tag', 'tags' => ['x']])->assertStatus(422);
        $this->bulk(['ids' => range(1, 101), 'action' => 'email', 'subject' => 's', 'body' => 'b'])->assertStatus(422);
        $this->bulk(['ids' => [1], 'action' => 'delete'])->assertStatus(422);

        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);
        $this->bulk(['ids' => [1], 'action' => 'tag', 'tags' => ['x']])->assertForbidden();
    }

    public function test_bulk_actions_cannot_touch_other_companies(): void
    {
        $other = Company::create(['name' => 'Other Co']);
        $otherJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        $foreign = Candidate::create(['job_opening_id' => $otherJob->id, 'company_id' => $other->id, 'full_name' => 'Foreign One', 'email' => 'f@example.com', 'stage' => 'applied']);

        $response = $this->bulk(['ids' => [$foreign->id], 'action' => 'move', 'stage' => 'screening'])->assertOk();

        $this->assertSame([], $response->json('data.succeeded'));
        $this->assertSame('applied', $foreign->fresh()->stage);
    }

    // ---- CSV import ---------------------------------------------------------------

    private function csv(string $content, string $name = 'candidates.csv'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $content);
    }

    private function import(string $content, array $extra = [])
    {
        return $this->post('/api/v1/candidates/import', array_merge([
            'job_opening_id' => $this->job->id,
            'file' => $this->csv($content),
        ], $extra), ['Accept' => 'application/json']);
    }

    public function test_import_creates_candidates_with_tags_skills_and_stage_history(): void
    {
        $csv = "Name,Email Address,Mobile,Source,Tags,Skills,Years of Experience,Rating\n"
            . "Amna Khan,amna@example.com,0300 1111111,Referral,\"remote;senior\",\"PHP, Laravel\",5,4\n"
            . "Bilal Ahmed,bilal@example.com,,,,,,\n";

        $response = $this->import($csv)->assertOk();

        $response->assertJsonPath('data.created', 2)->assertJsonPath('data.skipped', 0)->assertJsonPath('data.dry_run', false);

        $amna = Candidate::where('email', 'amna@example.com')->firstOrFail();
        $this->assertSame('applied', $amna->stage);
        $this->assertSame('Referral', $amna->source);
        $this->assertSame(['remote', 'senior'], $amna->tags);
        $this->assertSame(['PHP', 'Laravel'], $amna->skills);
        $this->assertSame(5.0, $amna->experience_years);
        $this->assertSame(4, (int) $amna->rating);
        $this->assertSame('3001111111', $amna->phone_normalized);
        $this->assertSame('CSV import', Candidate::where('email', 'bilal@example.com')->value('source'));
        $this->assertDatabaseHas('candidate_stage_histories', ['candidate_id' => $amna->id, 'to_stage' => 'applied', 'reason' => 'Imported from CSV']);
    }

    public function test_dry_run_reports_without_writing(): void
    {
        $csv = "full_name,email\nAmna Khan,amna@example.com\nBroken,not-an-email\n";

        $response = $this->import($csv, ['dry_run' => 1])->assertOk();

        $response->assertJsonPath('data.dry_run', true)->assertJsonPath('data.created', 1)->assertJsonPath('data.skipped', 1);
        $this->assertSame('error', $response->json('data.rows.1.status'));
        $this->assertSame(0, Candidate::count());
    }

    public function test_import_skips_duplicates_and_bad_rows_but_keeps_the_good_ones(): void
    {
        $this->candidate('Existing Person');
        $other = JobOpening::create(['title' => 'Other role', 'company_id' => $this->company->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        Candidate::create(['job_opening_id' => $other->id, 'company_id' => $this->company->id, 'full_name' => 'Elsewhere', 'email' => 'elsewhere@example.com']);

        $csv = "full_name,email,rating\n"
            . "Existing Person,existing.person@example.com,3\n"
            . "Fresh One,fresh@example.com,3\n"
            . "Fresh Again,FRESH@example.com,3\n"
            . ",nobody@example.com,3\n"
            . "Bad Rating,rating@example.com,9\n"
            . "Elsewhere,elsewhere@example.com,2\n"
            . ",,\n";

        $response = $this->import($csv)->assertOk();

        $response->assertJsonPath('data.total', 6)->assertJsonPath('data.created', 2)->assertJsonPath('data.skipped', 4)->assertJsonPath('data.warnings', 1);
        $rows = collect($response->json('data.rows'))->keyBy('row');
        $this->assertSame('Already applied for this job.', $rows[2]['message']);
        $this->assertSame('skipped', $rows[4]['status']);
        $this->assertSame('error', $rows[5]['status']);
        $this->assertSame('Also applied for another job.', $rows[7]['message']);
        $this->assertSame(1, Candidate::where('email', 'like', 'fresh%')->count());
    }

    public function test_import_handles_semicolons_bom_and_rejects_files_without_required_columns(): void
    {
        $this->import("\xEF\xBB\xBFname;email\nAmna Khan;amna@example.com\n")->assertOk()->assertJsonPath('data.created', 1);

        $this->import("name,phone\nAmna Khan,0300\n")->assertStatus(422)->assertJsonValidationErrors('file');
        $this->import('')->assertStatus(422);
    }

    public function test_import_is_limited_in_size_job_state_and_permissions(): void
    {
        $rows = "full_name,email\n";
        for ($i = 0; $i < 501; $i++) {
            $rows .= "Person {$i},p{$i}@example.com\n";
        }
        $this->import($rows)->assertStatus(422)->assertJsonValidationErrors('file');
        $this->assertSame(0, Candidate::count());

        $this->job->update(['status' => 'closed']);
        $this->import("full_name,email\nA B,ab@example.com\n")->assertStatus(422)->assertJsonValidationErrors('job_opening_id');

        $other = Company::create(['name' => 'Other Co']);
        $foreignJob = JobOpening::create(['title' => 'X', 'company_id' => $other->id, 'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1]);
        $this->import("full_name,email\nA B,ab@example.com\n", ['job_opening_id' => $foreignJob->id])->assertStatus(422);

        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);
        $this->import("full_name,email\nA B,ab@example.com\n")->assertForbidden();
    }
}
