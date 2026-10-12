<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\Interview;
use App\Models\InterviewRescheduleRequest;
use App\Models\JobOpening;
use App\Models\Offer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentPortalActionsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hrManager;

    private JobOpening $job;

    private Candidate $candidate;

    /** @var array<int, array{to: string, subject: string, body: string}> */
    private array $mails = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) {
            $this->mails[] = ['to' => $event->message->getTo()[0]->getAddress(), 'subject' => $event->message->getSubject(), 'body' => $event->message->getTextBody()];
        });

        $this->company = Company::create(['name' => 'Acme HR', 'careers_slug' => 'acme', 'careers_enabled' => true]);
        $this->grantLicense($this->company, ['recruitment', 'approvals']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $this->job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1, 'recruiter_id' => $this->recruiter->id,
        ]);
        $this->candidate = Candidate::create([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id,
            'full_name' => 'Ayesha Malik', 'email' => 'ayesha@example.com', 'stage' => 'interview',
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function token(?Candidate $candidate = null): string
    {
        return $this->postJson('/api/v1/candidates/' . ($candidate ?? $this->candidate)->id . '/portal-link')->assertOk()->json('data.token');
    }

    private function asGuest(): void
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
    }

    private function interview(array $overrides = []): Interview
    {
        return Interview::create(array_merge([
            'candidate_id' => $this->candidate->id, 'company_id' => $this->company->id, 'interviewer_name' => 'Panel',
            'interview_type' => 'technical', 'scheduled_at' => now()->addDays(3)->setTime(10, 0), 'duration_minutes' => 60, 'status' => 'scheduled',
        ], $overrides));
    }

    private function sentOffer(): Offer
    {
        $this->candidate->update(['stage' => 'offer']);

        return Offer::create([
            'company_id' => $this->company->id, 'candidate_id' => $this->candidate->id, 'created_by' => $this->recruiter->id,
            'salary' => 150000, 'currency' => 'PKR', 'status' => 'sent', 'sent_at' => now(), 'terms' => 'Probation: 3 months',
        ]);
    }

    private function lastCode(): string
    {
        preg_match('/code is: (\d{6})/', end($this->mails)['body'], $match);

        return $match[1];
    }

    // ---- reschedule -------------------------------------------------------------------

    public function test_a_candidate_can_ask_to_move_an_interview_and_staff_moving_it_answers_the_request(): void
    {
        $interview = $this->interview();
        $token = $this->token();
        $proposed = now()->addDays(5)->setTime(14, 0)->toIso8601String();

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.interviews.0.id', $interview->id)->assertJsonPath('data.interviews.0.reschedule_requested', false);
        $this->postJson("/api/v1/public/portal/{$token}/interviews/{$interview->id}/reschedule", [])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->postJson("/api/v1/public/portal/{$token}/interviews/{$interview->id}/reschedule", ['note' => 'I have a clash', 'proposed_times' => [$proposed]])->assertCreated();
        $this->postJson("/api/v1/public/portal/{$token}/interviews/{$interview->id}/reschedule", ['note' => 'again'])->assertStatus(422)->assertJsonValidationErrors('interview_id');
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.interviews.0.reschedule_requested', true);

        $this->assertDatabaseHas('notifications', ['user_id' => $this->recruiter->id, 'type' => 'recruitment_interview', 'title' => 'Reschedule requested: Ayesha Malik']);

        Sanctum::actingAs($this->recruiter);
        $this->getJson("/api/v1/candidates/{$this->candidate->id}")->assertJsonCount(1, 'data.pending_reschedule_requests');
        $this->getJson('/api/v1/interviews')->assertJsonPath('data.data.0.pending_reschedule_count', 1);

        $this->mails = [];
        $this->putJson("/api/v1/interviews/{$interview->id}", ['scheduled_at' => $proposed])->assertOk();

        $this->assertSame('resolved', InterviewRescheduleRequest::first()->status);
        $this->assertSame($this->recruiter->id, InterviewRescheduleRequest::first()->resolved_by);
        $this->assertSame('Your interview for Backend Engineer has a new time', $this->mails[0]['subject']);
        $this->assertSame('ayesha@example.com', $this->mails[0]['to']);
    }

    public function test_staff_can_decline_a_reschedule_request_and_past_or_foreign_interviews_are_refused(): void
    {
        $interview = $this->interview();
        $past = $this->interview(['scheduled_at' => now()->subDay()]);
        $other = Candidate::create(['job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'Other', 'email' => 'other@example.com', 'stage' => 'interview']);
        $foreign = Interview::create(['candidate_id' => $other->id, 'company_id' => $this->company->id, 'interviewer_name' => 'Panel', 'interview_type' => 'technical', 'scheduled_at' => now()->addDay(), 'status' => 'scheduled']);
        $token = $this->token();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/interviews/{$past->id}/reschedule", ['note' => 'x'])->assertStatus(422);
        $this->postJson("/api/v1/public/portal/{$token}/interviews/{$foreign->id}/reschedule", ['note' => 'x'])->assertStatus(422);
        $this->postJson("/api/v1/public/portal/{$token}/interviews/{$interview->id}/reschedule", ['note' => 'Cannot make it'])->assertCreated();

        Sanctum::actingAs($this->recruiter);
        $requestId = InterviewRescheduleRequest::first()->id;
        $this->mails = [];
        $this->postJson("/api/v1/reschedule-requests/{$requestId}/decline", ['note' => 'Panel is only free then'])->assertOk()->assertJsonPath('data.status', 'declined');
        $this->postJson("/api/v1/reschedule-requests/{$requestId}/decline", [])->assertStatus(422);
        $this->assertStringContainsString('Panel is only free then', $this->mails[0]['body']);
        $this->assertSame($interview->scheduled_at->toIso8601String(), $interview->fresh()->scheduled_at->toIso8601String());
    }

    // ---- withdraw ---------------------------------------------------------------------

    public function test_a_candidate_can_withdraw_their_application(): void
    {
        $interview = $this->interview();
        $offer = $this->sentOffer();
        $token = $this->token();

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.can_withdraw', true);
        $this->postJson("/api/v1/public/portal/{$token}/withdraw", ['reason' => 'Took another job'])
            ->assertOk()
            ->assertJsonPath('data.status.key', 'withdrawn')
            ->assertJsonPath('data.can_withdraw', false)
            ->assertJsonPath('data.can_upload', false);

        $candidate = $this->candidate->fresh();
        $this->assertSame('rejected', $candidate->stage);
        $this->assertNotNull($candidate->withdrawn_at);
        $this->assertSame('Withdrawn by the candidate: Took another job', $candidate->rejection_reason);
        $this->assertSame('cancelled', $interview->fresh()->status);
        $this->assertSame('withdrawn', $offer->fresh()->status);
        $this->assertDatabaseHas('notifications', ['user_id' => $this->recruiter->id, 'title' => 'Candidate withdrew: Ayesha Malik']);

        $this->postJson("/api/v1/public/portal/{$token}/withdraw", [])->assertStatus(422);

        // Staff can reopen it, which makes it a live application again.
        Sanctum::actingAs($this->recruiter);
        $this->patchJson("/api/v1/candidates/{$this->candidate->id}/stage", ['stage' => 'screening'])->assertOk();
        $this->assertNull($this->candidate->fresh()->withdrawn_at);
    }

    public function test_a_hired_candidate_cannot_withdraw_through_the_portal(): void
    {
        $this->candidate->update(['stage' => 'hired']);
        $token = $this->token();

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.can_withdraw', false);
        $this->postJson("/api/v1/public/portal/{$token}/withdraw", [])->assertStatus(422)->assertJsonValidationErrors('application');
        $this->assertSame('hired', $this->candidate->fresh()->stage);
    }

    // ---- messages ---------------------------------------------------------------------

    public function test_candidate_and_team_can_message_each_other(): void
    {
        $token = $this->token();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/messages", ['body' => ''])->assertStatus(422);
        $this->postJson("/api/v1/public/portal/{$token}/messages", ['body' => 'Is the office remote friendly?'])->assertCreated()->assertJsonPath('data.messages.0.from', 'you');
        $this->assertDatabaseHas('notifications', ['user_id' => $this->recruiter->id, 'type' => 'recruitment_message', 'title' => 'Message from Ayesha Malik']);

        Sanctum::actingAs($this->recruiter);
        $this->getJson("/api/v1/candidates/{$this->candidate->id}")->assertJsonPath('data.unread_messages', 1);
        $this->getJson("/api/v1/candidates/{$this->candidate->id}/messages")->assertOk()->assertJsonPath('data.0.body', 'Is the office remote friendly?');
        $this->getJson("/api/v1/candidates/{$this->candidate->id}")->assertJsonPath('data.unread_messages', 0);

        $this->mails = [];
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/messages", ['body' => 'Yes, two days a week on site.'])->assertCreated();
        $this->assertSame('ayesha@example.com', $this->mails[0]['to']);
        $this->assertStringContainsString('Yes, two days a week on site.', $this->mails[0]['body']);
        $this->assertStringNotContainsString('/candidate-portal/', $this->mails[0]['body']);

        $this->asGuest();
        $first = $this->getJson("/api/v1/public/portal/{$token}")->assertOk();
        $first->assertJsonPath('data.unread_messages', 1)->assertJsonPath('data.messages.1.from', 'team')->assertJsonPath('data.messages.1.author', $this->recruiter->name);
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.unread_messages', 0);

        // Internal data never leaks into the thread.
        $this->assertStringNotContainsString('user_id', json_encode($first->json('data.messages')));
    }

    public function test_viewers_cannot_message_candidates(): void
    {
        $viewer = $this->createUserWithRole(User::ROLE_EMPLOYEE, ['company_id' => $this->company->id]);
        Sanctum::actingAs($viewer);

        $this->postJson("/api/v1/candidates/{$this->candidate->id}/messages", ['body' => 'hi'])->assertForbidden();
    }

    // ---- offer e-signature ------------------------------------------------------------

    public function test_accepting_needs_the_emailed_code_and_stores_signature_evidence(): void
    {
        $offer = $this->sentOffer();
        $token = $this->token();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => '000000', 'consent' => true])
            ->assertStatus(422)->assertJsonValidationErrors('code');

        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertOk()->assertJsonPath('data.email', 'ay••••@example.com');
        $this->assertSame('ayesha@example.com', end($this->mails)['to']);
        $code = $this->lastCode();

        // A second request within a minute is refused.
        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertStatus(422)->assertJsonValidationErrors('code');

        $wrong = $code === '111111' ? '222222' : '111111';
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $wrong, 'consent' => true])
            ->assertStatus(422)->assertJsonValidationErrors('code');
        $this->assertSame('sent', $offer->fresh()->status);

        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $code, 'consent' => true])->assertOk();

        $offer->refresh();
        $record = $offer->signature_record;
        $this->assertSame('accepted', $offer->status);
        $this->assertSame('Ayesha Malik', $record['name']);
        $this->assertSame('ayesha@example.com', $record['email']);
        $this->assertSame('email_code', $record['verification']);
        $this->assertNotEmpty($record['ip']);
        $this->assertSame(64, strlen($record['document_hash']));
        $this->assertStringContainsString('sign this offer electronically', $record['consent']);

        // The same code cannot be used again, and the signed PDF carries the signature block.
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $code, 'consent' => true])->assertStatus(422);
        $this->get("/api/v1/public/portal/{$token}/offer-pdf")->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->assertStringContainsString('Signed electronically', view('recruitment.offer-letter', [
            'offer' => $offer, 'candidate' => $this->candidate, 'job' => $this->job, 'department' => 'Engineering', 'company' => $this->company,
        ])->render());

        // Staff see the evidence.
        Sanctum::actingAs($this->recruiter);
        $this->getJson("/api/v1/offers/{$offer->id}")->assertJsonPath('data.signature_record.name', 'Ayesha Malik')->assertJsonMissingPath('data.sign_code_hash');
    }

    private function signOffer(): array
    {
        $offer = $this->sentOffer();
        $token = $this->token();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertOk();
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $this->lastCode(), 'consent' => true])->assertOk();

        return [$offer->fresh(), $token];
    }

    public function test_a_signed_offer_is_sealed_and_its_letter_is_frozen(): void
    {
        [$offer, $token] = $this->signOffer();
        $record = $offer->signature_record;

        $this->assertSame(64, strlen($record['seal']));
        $this->assertSame(64, strlen($record['pdf_hash']));
        Storage::disk('local')->assertExists($record['pdf_path']);

        Sanctum::actingAs($this->recruiter);
        $this->getJson("/api/v1/offers/{$offer->id}/signature-verification")
            ->assertOk()
            ->assertJsonPath('data.valid', true)
            ->assertJsonPath('data.seal_valid', true)
            ->assertJsonPath('data.terms_unchanged', true)
            ->assertJsonPath('data.letter_intact', true);

        // Both staff and the candidate are served the stored letter, byte for byte.
        $stored = Storage::disk('local')->get($record['pdf_path']);
        $this->assertSame($stored, $this->get("/api/v1/offers/{$offer->id}/pdf")->assertOk()->streamedContent());

        $this->asGuest();
        $this->assertSame($stored, $this->get("/api/v1/public/portal/{$token}/offer-pdf")->assertOk()->streamedContent());
    }

    public function test_changing_the_terms_the_record_or_the_stored_letter_after_signing_is_detected(): void
    {
        [$offer] = $this->signOffer();
        Sanctum::actingAs($this->recruiter);
        $verify = fn () => $this->getJson("/api/v1/offers/{$offer->id}/signature-verification")->assertOk();

        $verify()->assertJsonPath('data.valid', true);

        // 1. The salary is edited behind the system's back.
        Offer::whereKey($offer->id)->update(['salary' => 999999]);
        $verify()->assertJsonPath('data.valid', false)->assertJsonPath('data.terms_unchanged', false)->assertJsonPath('data.seal_valid', true);
        Offer::whereKey($offer->id)->update(['salary' => 150000]);
        $verify()->assertJsonPath('data.valid', true);

        // 2. The signature record is rewritten (for example a different signer name).
        $record = $offer->fresh()->signature_record;
        Offer::whereKey($offer->id)->update(['signature_record' => json_encode(['name' => 'Someone Else'] + $record)]);
        $verify()->assertJsonPath('data.valid', false)->assertJsonPath('data.seal_valid', false);
        Offer::whereKey($offer->id)->update(['signature_record' => json_encode($record)]);

        // 3. The stored letter is swapped.
        Storage::disk('local')->put($record['pdf_path'], 'forged');
        $verify()->assertJsonPath('data.valid', false)->assertJsonPath('data.letter_intact', false);
    }

    public function test_an_unsigned_offer_reports_that_it_has_no_signature(): void
    {
        $offer = $this->sentOffer();
        Sanctum::actingAs($this->recruiter);

        $this->getJson("/api/v1/offers/{$offer->id}/signature-verification")->assertOk()->assertJsonPath('data.signed', false)->assertJsonPath('data.valid', false);
    }

    public function test_five_wrong_codes_lock_the_code_and_it_expires(): void
    {
        $offer = $this->sentOffer();
        $token = $this->token();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertOk();
        $code = $this->lastCode();
        $wrong = $code === '111111' ? '222222' : '111111';

        foreach (range(1, 5) as $attempt) {
            $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $wrong, 'consent' => true])->assertStatus(422);
        }

        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $code, 'consent' => true])
            ->assertStatus(422)->assertJsonPath('errors.code.0', 'Too many wrong attempts. Ask for a new code.');

        $this->travel(2)->minutes();
        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertOk();
        $fresh = $this->lastCode();

        $this->travel(20)->minutes();
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $fresh, 'consent' => true])
            ->assertStatus(422)->assertJsonPath('errors.code.0', 'Ask for a new code first, then enter it here.');
        $this->assertSame('sent', $offer->fresh()->status);
    }
}
