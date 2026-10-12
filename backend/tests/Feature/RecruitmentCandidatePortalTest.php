<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\Offer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecruitmentCandidatePortalTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $recruiter;

    private User $hrManager;

    private JobOpening $job;

    private Candidate $candidate;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->captureMail();

        $this->company = Company::create(['name' => 'Acme HR', 'careers_slug' => 'acme', 'careers_enabled' => true]);
        $this->grantLicense($this->company, ['recruitment', 'approvals']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $this->company->id]);
        $this->recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $this->company->id]);
        $this->hrManager = $this->createUserWithRole(User::ROLE_HR_MANAGER, ['company_id' => $this->company->id]);
        $this->job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $this->company->id,
            'employment_type' => 'full_time', 'status' => 'open', 'open_positions' => 1, 'is_public' => true,
            'recruiter_id' => $this->recruiter->id,
        ]);
        $this->candidate = Candidate::create([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id,
            'full_name' => 'Ayesha Malik', 'email' => 'ayesha@example.com', 'stage' => 'interview',
            'rating' => 5, 'notes' => 'INTERNAL: strong but pricey',
        ]);
        Sanctum::actingAs($this->recruiter);
    }

    private function token(?Candidate $candidate = null): string
    {
        return $this->postJson('/api/v1/candidates/' . ($candidate ?? $this->candidate)->id . '/portal-link')
            ->assertOk()
            ->json('data.token');
    }

    /** @var array<int, array{to: string, body: string}> */
    private array $mails = [];

    private function captureMail(): void
    {
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) {
            $this->mails[] = ['to' => $event->message->getTo()[0]->getAddress(), 'body' => $event->message->getTextBody()];
        });
    }

    /** Ask the portal to email a signing code and read it back from the captured email. */
    private function signingCode(string $token): string
    {
        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertOk();
        $this->assertNotEmpty($this->mails);
        preg_match('/code is: (\d{6})/', end($this->mails)['body'], $match);

        return $match[1];
    }

    /** Public calls must work without any signed-in user. */
    private function asGuest(): void
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
    }

    private function sentOffer(array $overrides = []): Offer
    {
        $offer = Offer::create(array_merge([
            'company_id' => $this->company->id, 'candidate_id' => $this->candidate->id, 'created_by' => $this->recruiter->id,
            'salary' => 150000, 'currency' => 'PKR', 'start_date' => '2026-12-01', 'benefits' => ['Health insurance'],
            'terms' => 'Three-month probation.', 'status' => 'sent', 'sent_at' => now(),
        ], $overrides));
        $this->candidate->update(['stage' => 'offer']);

        return $offer;
    }

    // ---- access -------------------------------------------------------------------

    public function test_staff_issue_a_link_and_the_candidate_sees_only_safe_information(): void
    {
        Interview::create([
            'candidate_id' => $this->candidate->id, 'company_id' => $this->company->id, 'interviewer_name' => 'Secret Panel',
            'interview_type' => 'technical', 'scheduled_at' => now()->addDays(2), 'status' => 'scheduled',
            'location' => 'Head office', 'feedback' => 'INTERNAL feedback',
        ]);
        Offer::create(['company_id' => $this->company->id, 'candidate_id' => $this->candidate->id, 'salary' => 1, 'status' => 'draft']);

        $link = $this->postJson("/api/v1/candidates/{$this->candidate->id}/portal-link")->assertOk();
        $this->assertStringContainsString('/candidate-portal/' . $link->json('data.token'), $link->json('data.url'));
        $this->assertDatabaseMissing('candidates', ['portal_token_hash' => $link->json('data.token')]);

        $this->asGuest();
        $body = $this->getJson('/api/v1/public/portal/' . $link->json('data.token'))->assertOk();

        $body->assertJsonPath('data.company.name', 'Acme HR')
            ->assertJsonPath('data.job.title', 'Backend Engineer')
            ->assertJsonPath('data.status.key', 'interview')
            ->assertJsonPath('data.candidate.full_name', 'Ayesha Malik')
            ->assertJsonCount(1, 'data.interviews')
            ->assertJsonPath('data.interviews.0.location', 'Head office')
            ->assertJsonPath('data.offer', null);

        $raw = $body->getContent();
        foreach (['INTERNAL', 'Secret Panel', 'rating', 'rejection_reason', 'portal_token'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $raw, "portal leaked {$forbidden}");
        }
    }

    public function test_invalid_expired_and_replaced_links_are_rejected(): void
    {
        $first = $this->token();
        $second = $this->token();

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$first}")->assertNotFound();
        $this->getJson('/api/v1/public/portal/not-a-real-token')->assertNotFound();
        $this->getJson("/api/v1/public/portal/{$second}")->assertOk();

        $this->candidate->update(['portal_token_expires_at' => now()->subMinute()]);
        $this->getJson("/api/v1/public/portal/{$second}")->assertNotFound();
    }

    public function test_viewers_cannot_issue_links(): void
    {
        $viewer = User::factory()->create(['company_id' => $this->company->id]);
        $viewer->givePermissionTo('recruitment:view');
        Sanctum::actingAs($viewer);

        $this->postJson("/api/v1/candidates/{$this->candidate->id}/portal-link")->assertForbidden();
    }

    public function test_rejected_candidates_see_a_neutral_closed_status(): void
    {
        $this->candidate->update(['stage' => 'rejected', 'rejection_reason' => 'Too expensive']);
        $token = $this->token();

        $this->asGuest();
        $response = $this->getJson("/api/v1/public/portal/{$token}")->assertOk();

        $response->assertJsonPath('data.status.key', 'closed')->assertJsonPath('data.can_upload', false);
        $this->assertStringNotContainsString('Too expensive', $response->getContent());
    }

    // ---- offers -------------------------------------------------------------------

    public function test_only_sent_offers_are_visible_and_the_candidate_can_accept_with_their_name(): void
    {
        $token = $this->token();
        $draft = Offer::create(['company_id' => $this->company->id, 'candidate_id' => $this->candidate->id, 'salary' => 1, 'status' => 'draft']);

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.offer', null);
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => '123456', 'consent' => true])->assertStatus(422)->assertJsonValidationErrors('offer');

        $draft->update(['status' => 'sent']);
        $this->candidate->update(['stage' => 'offer']);

        $this->getJson("/api/v1/public/portal/{$token}")
            ->assertJsonPath('data.offer.status', 'sent')
            ->assertJsonPath('data.offer.can_respond', true)
            ->assertJsonPath('data.status.key', 'offer');

        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted'])->assertStatus(422)->assertJsonValidationErrors(['name', 'code', 'consent']);

        $code = $this->signingCode($token);
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Someone Else', 'code' => $code, 'consent' => true])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => $code, 'consent' => false])->assertStatus(422)->assertJsonValidationErrors('consent');
        $this->assertSame('sent', $draft->fresh()->status);

        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => '  ayesha   MALIK ', 'code' => $code, 'consent' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted')
            ->assertJsonPath('data.signature.name', 'Ayesha Malik');

        $offer = $draft->fresh();
        $this->assertSame('accepted', $offer->status);
        $this->assertSame('portal', $offer->responded_via);
        $this->assertSame('Ayesha Malik', $offer->response_name);
        $this->assertNotNull($offer->response_ip);
        $this->assertNotNull($offer->responded_at);
        $this->assertSame('email_code', $offer->signature_record['verification']);
        $this->assertSame($offer->document_hash, $offer->signature_record['document_hash']);
        $this->assertNull($offer->sign_code_hash);

        // The hiring team is told, and can now hire without any manual "mark accepted" step.
        $this->assertDatabaseHas('notifications', ['user_id' => $this->recruiter->id, 'type' => 'recruitment_offer']);
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.status.key', 'offer_accepted');
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'declined'])->assertStatus(422);

        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/hire", [])->assertOk()->assertJsonPath('data.candidate.stage', 'hired');
    }

    public function test_the_candidate_can_decline_with_a_reason(): void
    {
        $offer = $this->sentOffer();
        $token = $this->token();

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'declined', 'reason' => 'Accepted another role'])
            ->assertOk()
            ->assertJsonPath('data.status', 'declined');

        $offer->refresh();
        $this->assertSame('declined', $offer->status);
        $this->assertSame('Accepted another role', $offer->decline_reason);
        $this->assertSame('portal', $offer->responded_via);
        $this->assertNull($offer->response_name);
    }

    public function test_an_offer_past_its_deadline_cannot_be_answered(): void
    {
        $offer = $this->sentOffer(['expires_at' => now()->subDay()->toDateString()]);
        $token = $this->token();

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.offer.status', 'expired')->assertJsonPath('data.offer.can_respond', false);
        $this->postJson("/api/v1/public/portal/{$token}/offer/code")->assertStatus(422);
        $this->postJson("/api/v1/public/portal/{$token}/offer", ['response' => 'accepted', 'name' => 'Ayesha Malik', 'code' => '123456', 'consent' => true])->assertStatus(422);
        $this->assertSame('expired', $offer->fresh()->status);
    }

    public function test_one_candidate_cannot_answer_another_candidates_offer(): void
    {
        $this->sentOffer();
        $other = Candidate::create([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'Other Person', 'email' => 'other@example.com', 'stage' => 'interview',
        ]);
        $otherToken = $this->token($other);

        $this->asGuest();
        $this->postJson("/api/v1/public/portal/{$otherToken}/offer", ['response' => 'accepted', 'name' => 'Other Person', 'code' => '123456', 'consent' => true])->assertStatus(422);
        $this->assertSame('sent', Offer::where('candidate_id', $this->candidate->id)->value('status'));
    }

    public function test_sending_an_offer_emails_the_candidate_a_portal_link(): void
    {
        $captured = [];
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) use (&$captured) {
            $captured[] = ['to' => $event->message->getTo()[0]->getAddress(), 'body' => $event->message->getTextBody()];
        });

        $offer = $this->sentOffer(['status' => 'approved']);
        $this->candidate->update(['stage' => 'interview']);

        $response = $this->postJson("/api/v1/offers/{$offer->id}/send")->assertOk()->assertJsonPath('data.status', 'sent')->assertJsonPath('data.candidate_emailed', true);

        $this->assertCount(1, $captured);
        $this->assertSame('ayesha@example.com', $captured[0]['to']);
        $this->assertMatchesRegularExpression('#/candidate-portal/[A-Za-z0-9]{48}#', $captured[0]['body']);
        preg_match('#/candidate-portal/([A-Za-z0-9]{48})#', $captured[0]['body'], $match);

        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$match[1]}")->assertOk()->assertJsonPath('data.offer.status', 'sent');
    }

    public function test_offer_letter_pdf_is_only_available_for_a_sent_offer(): void
    {
        $token = $this->token();

        $this->asGuest();
        $this->get("/api/v1/public/portal/{$token}/offer-pdf")->assertNotFound();

        $this->sentOffer();
        $this->get("/api/v1/public/portal/{$token}/offer-pdf")->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    // ---- documents ----------------------------------------------------------------

    public function test_recruiters_request_documents_and_the_candidate_fulfils_them(): void
    {
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/documents/request", ['labels' => ['National ID', 'Degree certificate', 'national id']])
            ->assertCreated()
            ->assertJsonPath('data.created', 2)
            ->assertJsonPath('data.emailed', true);

        // Asking again is a no-op.
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/documents/request", ['labels' => ['National ID']])->assertCreated()->assertJsonPath('data.created', 0);

        $token = $this->token();
        $requested = $this->getJson("/api/v1/candidates/{$this->candidate->id}/documents")->json('data');
        $idCard = collect($requested)->firstWhere('label', 'National ID');
        $this->assertSame('requested', $idCard['status']);
        $this->assertArrayNotHasKey('file_path', $idCard);

        $this->asGuest();
        $this->post("/api/v1/public/portal/{$token}/documents", [
            'document_id' => $idCard['id'], 'file' => UploadedFile::fake()->create('id.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.status', 'uploaded');

        // An extra, unrequested document needs a label.
        $this->post("/api/v1/public/portal/{$token}/documents", ['file' => UploadedFile::fake()->create('ref.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('label');
        $this->post("/api/v1/public/portal/{$token}/documents", ['label' => 'Reference letter', 'file' => UploadedFile::fake()->create('ref.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertCreated();

        // Bad files are refused.
        $this->post("/api/v1/public/portal/{$token}/documents", ['label' => 'Script', 'file' => UploadedFile::fake()->create('x.exe', 10)], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post("/api/v1/public/portal/{$token}/documents", ['label' => 'Huge', 'file' => UploadedFile::fake()->create('big.pdf', 6000, 'application/pdf')], ['Accept' => 'application/json'])->assertStatus(422);

        $portal = $this->getJson("/api/v1/public/portal/{$token}")->assertOk();
        $this->assertCount(3, $portal->json('data.documents'));
        $this->assertStringNotContainsString('recruitment/documents', $portal->getContent());

        $this->get("/api/v1/public/portal/{$token}/documents/{$idCard['id']}/download")->assertOk();
        $this->assertDatabaseHas('notifications', ['user_id' => $this->recruiter->id, 'type' => 'recruitment_document']);
    }

    public function test_staff_review_documents_and_rejections_need_a_note(): void
    {
        $token = $this->token();
        $this->asGuest();
        $this->post("/api/v1/public/portal/{$token}/documents", ['label' => 'Degree', 'file' => UploadedFile::fake()->create('degree.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        $documentId = $this->candidate->documents()->value('id');

        Sanctum::actingAs($this->recruiter);
        $this->getJson("/api/v1/candidates/{$this->candidate->id}/documents/{$documentId}/download")->assertOk();
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/documents/{$documentId}/review", ['status' => 'rejected'])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/documents/{$documentId}/review", ['status' => 'rejected', 'note' => 'Image is blurry'])
            ->assertOk()->assertJsonPath('data.status', 'rejected');

        // The candidate sees why and can upload a replacement.
        $this->asGuest();
        $this->getJson("/api/v1/public/portal/{$token}")->assertJsonPath('data.documents.0.review_note', 'Image is blurry');
        $this->post("/api/v1/public/portal/{$token}/documents", ['document_id' => $documentId, 'file' => UploadedFile::fake()->create('degree2.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.status', 'uploaded');

        Sanctum::actingAs($this->recruiter);
        $this->postJson("/api/v1/candidates/{$this->candidate->id}/documents/{$documentId}/review", ['status' => 'verified'])->assertOk()->assertJsonPath('data.status', 'verified');

        // A verified document is final.
        $this->asGuest();
        $this->post("/api/v1/public/portal/{$token}/documents", ['document_id' => $documentId, 'file' => UploadedFile::fake()->create('again.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])->assertStatus(422);

        Sanctum::actingAs($this->recruiter);
        $this->deleteJson("/api/v1/candidates/{$this->candidate->id}/documents/{$documentId}")->assertOk();
        $this->assertSame(0, $this->candidate->documents()->count());
        $this->assertSame([], Storage::disk('local')->allFiles('recruitment/documents'));
    }

    public function test_documents_are_private_to_their_candidate_and_company(): void
    {
        $token = $this->token();
        $other = Candidate::create([
            'job_opening_id' => $this->job->id, 'company_id' => $this->company->id, 'full_name' => 'Other Person', 'email' => 'other@example.com', 'stage' => 'applied',
        ]);
        $otherToken = $this->token($other);

        $this->asGuest();
        $this->post("/api/v1/public/portal/{$otherToken}/documents", ['label' => 'Passport', 'file' => UploadedFile::fake()->create('p.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        $foreignId = $other->documents()->value('id');

        $this->get("/api/v1/public/portal/{$token}/documents/{$foreignId}/download")->assertNotFound();
        $this->post("/api/v1/public/portal/{$token}/documents", ['document_id' => $foreignId, 'file' => UploadedFile::fake()->create('p.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])->assertNotFound();

        $outsider = Company::create(['name' => 'Other Co']);
        $this->grantLicense($outsider, ['recruitment']);
        Sanctum::actingAs($this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $outsider->id]));
        $this->getJson("/api/v1/candidates/{$other->id}/documents")->assertForbidden();
        $this->getJson("/api/v1/candidates/{$other->id}/documents/{$foreignId}/download")->assertForbidden();
    }

    public function test_rejected_candidates_cannot_upload(): void
    {
        $token = $this->token();
        $this->candidate->update(['stage' => 'rejected', 'rejection_reason' => 'x']);

        $this->asGuest();
        $this->post("/api/v1/public/portal/{$token}/documents", ['label' => 'CV', 'file' => UploadedFile::fake()->create('cv.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_a_candidate_is_limited_to_twenty_documents(): void
    {
        $token = $this->token();

        $this->asGuest();
        for ($i = 1; $i <= 20; $i++) {
            $this->post("/api/v1/public/portal/{$token}/documents", ['label' => "Doc {$i}", 'file' => UploadedFile::fake()->create("d{$i}.pdf", 10, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        }

        $this->post("/api/v1/public/portal/{$token}/documents", ['label' => 'One more', 'file' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertStatus(422);
    }

    // ---- careers page integration -------------------------------------------------

    public function test_applying_gives_the_applicant_a_portal_path_and_an_email(): void
    {
        $captured = [];
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) use (&$captured) {
            $captured[] = $event->message->getTextBody();
        });

        $this->asGuest();
        $response = $this->post("/api/v1/public/careers/acme/jobs/{$this->job->id}/apply", [
            'full_name' => 'Zara Applicant', 'email' => 'zara@example.com',
            'resume' => UploadedFile::fake()->create('cv.pdf', 50, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $path = $response->json('data.portal_path');
        $this->assertMatchesRegularExpression('#^/candidate-portal/[A-Za-z0-9]{48}$#', $path);
        $this->assertStringContainsString($path, implode("\n", $captured));

        $this->getJson('/api/v1/public/portal/' . basename($path))->assertOk()->assertJsonPath('data.status.key', 'received')->assertJsonPath('data.candidate.full_name', 'Zara Applicant');
    }

    public function test_lost_links_are_resent_without_revealing_whether_an_application_exists(): void
    {
        $captured = [];
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Mail\Events\MessageSending::class, function ($event) use (&$captured) {
            $captured[] = $event->message->getTo()[0]->getAddress();
        });

        $this->asGuest();
        $known = $this->postJson('/api/v1/public/careers/acme/portal-link', ['email' => 'AYESHA@example.com'])->assertOk();
        $unknown = $this->postJson('/api/v1/public/careers/acme/portal-link', ['email' => 'nobody@example.com'])->assertOk();

        $this->assertSame($known->json('message'), $unknown->json('message'));
        $this->assertSame(['ayesha@example.com'], $captured);
        $this->postJson('/api/v1/public/careers/acme/portal-link', ['email' => 'not-an-email'])->assertStatus(422);
        $this->postJson('/api/v1/public/careers/missing/portal-link', ['email' => 'ayesha@example.com'])->assertNotFound();
    }

    public function test_the_portal_is_unavailable_when_the_company_has_no_recruitment_license(): void
    {
        $token = $this->token();
        \App\Models\License::query()->update(['is_active' => false]);

        $this->asGuest();
        $this->postJson('/api/v1/public/careers/acme/portal-link', ['email' => 'ayesha@example.com'])->assertNotFound();
    }
}
