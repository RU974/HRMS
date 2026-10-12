<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateMessage;
use App\Models\InterviewRescheduleRequest;
use App\Models\Company;
use App\Models\Offer;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The candidate portal has no accounts. A candidate is let in by an unguessable link; only a
 * hash of its token is stored, so a database leak does not leak access.
 */
class CandidatePortalService
{
    public const TOKEN_DAYS = 90;

    /** Offer statuses a candidate may see; drafts and approval chatter stay internal. */
    private const VISIBLE_OFFER_STATUSES = ['sent', 'accepted', 'declined', 'expired'];

    public function __construct(
        private readonly OfferService $offers,
        private readonly CandidateMailer $mailer,
        private readonly OfferSigningService $signing,
        private readonly CandidateMessageService $messages,
        private readonly TalentPoolService $pool,
    ) {
    }

    /**
     * Create a new link for the candidate. Any earlier link stops working.
     *
     * @return array{token: string, path: string, url: string, expires_at: string}
     */
    public function issueLink(Candidate $candidate): array
    {
        $token = Str::random(48);
        $expires = now()->addDays(self::TOKEN_DAYS);

        $candidate->forceFill([
            'portal_token_hash' => hash('sha256', $token),
            'portal_token_expires_at' => $expires,
        ])->save();

        $path = '/candidate-portal/' . $token;

        return [
            'token' => $token,
            'path' => $path,
            'url' => rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/') . $path,
            'expires_at' => $expires->toIso8601String(),
        ];
    }

    public function resolve(string $token): Candidate
    {
        $candidate = Candidate::query()
            ->withoutGlobalScopes()
            ->where('portal_token_hash', hash('sha256', $token))
            ->where('portal_token_expires_at', '>', now())
            ->first();

        abort_unless($candidate, 404, 'This link is not valid or has expired.');

        return $candidate;
    }

    /** Email the candidate a fresh link, with a message that explains why. */
    public function sendLink(Candidate $candidate, string $subject, string $intro): bool
    {
        $link = $this->issueLink($candidate);

        return $this->mailer->send($candidate, $subject, implode("\n\n", [
            $this->mailer->render('Hello {{first_name}},', $candidate),
            $this->mailer->render($intro, $candidate),
            'Open your candidate page: ' . $link['url'],
            'This link is private to you and stays valid for ' . self::TOKEN_DAYS . ' days. Please do not share it.',
        ]));
    }

    public function present(Candidate $candidate): array
    {
        // Public requests carry no tenant context, so relations are loaded unscoped from this one candidate.
        $candidate->load([
            'jobOpening' => fn ($query) => $query->withoutGlobalScopes(),
            'jobOpening.department' => fn ($query) => $query->withoutGlobalScopes(),
            'stageHistories' => fn ($query) => $query->withoutGlobalScopes(),
            'documents' => fn ($query) => $query->withoutGlobalScopes(),
        ]);
        $company = $candidate->company_id ? Company::query()->find($candidate->company_id) : null;

        $upcoming = $candidate->interviews()
            ->withoutGlobalScopes()
            ->where('status', 'scheduled')
            ->where('scheduled_at', '>=', now())
            ->orderBy('scheduled_at')
            ->get()
            ->map(fn ($interview) => [
                'id' => $interview->id,
                'reschedule_requested' => InterviewRescheduleRequest::query()->withoutGlobalScopes()
                    ->where('interview_id', $interview->id)->where('status', 'pending')->exists(),
                'type' => $interview->interview_type,
                'scheduled_at' => $interview->scheduled_at?->toIso8601String(),
                'duration_minutes' => $interview->duration_minutes,
                'location' => $interview->location,
                'meeting_link' => $interview->meeting_link,
            ])
            ->values();

        $offer = Offer::query()
            ->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->whereIn('status', self::VISIBLE_OFFER_STATUSES)
            ->latest('id')
            ->first();

        if ($offer && $offer->status === 'sent' && $this->offers->hasLapsed($offer)) {
            $offer->update(['status' => 'expired']);
        }

        $thread = $this->messages->thread($candidate);
        $unread = $thread->where('direction', CandidateMessage::FROM_STAFF)->whereNull('read_at')->count();
        $open = $candidate->stage !== 'rejected' && $candidate->status === 'active';

        return [
            'company' => ['name' => $company?->name, 'logo_url' => $company?->logo_url],
            'candidate' => ['full_name' => $candidate->full_name, 'email' => $candidate->email],
            'job' => [
                'title' => $candidate->jobOpening?->title,
                'department' => $candidate->jobOpening?->department?->name,
                'location' => $candidate->jobOpening?->location,
            ],
            'applied_at' => $candidate->applied_at?->toDateString(),
            'status' => $this->status($candidate, $offer),
            'timeline' => $candidate->stageHistories
                ->sortBy('id')
                ->map(fn ($history) => ['status' => $this->publicStage($history->to_stage)['key'], 'label' => $this->publicStage($history->to_stage)['label'], 'at' => $history->created_at?->toIso8601String()])
                ->values(),
            'interviews' => $upcoming,
            'offer' => $offer ? $this->presentOffer($offer) : null,
            'documents' => $candidate->documents->map(fn ($document) => [
                'id' => $document->id,
                'label' => $document->label,
                'status' => $document->status,
                'original_name' => $document->original_name,
                'uploaded_at' => $document->uploaded_at?->toIso8601String(),
                'review_note' => $document->status === 'rejected' ? $document->review_note : null,
                'has_file' => $document->has_file,
            ])->values(),
            'can_upload' => $open,
            'can_withdraw' => $open && $candidate->stage !== 'hired',
            'can_message' => $candidate->anonymized_at === null,
            'messages' => $thread->map(fn (CandidateMessage $message) => [
                'id' => $message->id,
                'from' => $message->direction === CandidateMessage::FROM_CANDIDATE ? 'you' : 'team',
                'author' => $message->direction === CandidateMessage::FROM_CANDIDATE ? null : $message->author?->name,
                'body' => $message->body,
                'at' => $message->created_at?->toIso8601String(),
            ])->values(),
            'unread_messages' => $unread,
            'talent_pool' => $this->presentPool($candidate),
        ];
    }

    /** The offer waiting for this candidate's answer, if any. */
    public function pendingOffer(Candidate $candidate): Offer
    {
        $offer = Offer::query()
            ->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->where('status', 'sent')
            ->latest('id')
            ->first();

        if (! $offer) {
            throw ValidationException::withMessages(['offer' => ['There is no offer waiting for your answer.']]);
        }

        if ($this->offers->hasLapsed($offer)) {
            $offer->update(['status' => 'expired']);

            throw ValidationException::withMessages(['offer' => ['This offer has expired. Please contact the hiring team.']]);
        }

        return $offer;
    }

    /** Email the one-time code that proves it is really the candidate signing. Returns the masked address. */
    public function sendSigningCode(Candidate $candidate): string
    {
        return $this->signing->sendCode($candidate, $this->pendingOffer($candidate));
    }

    /**
     * The candidate accepts (an e-signature backed by an emailed code) or declines the offer.
     *
     * @param  array{name?: ?string, code?: ?string, consent?: bool, reason?: ?string, ip?: ?string, user_agent?: ?string}  $input
     */
    public function respondToOffer(Candidate $candidate, string $response, array $input): Offer
    {
        $offer = $this->pendingOffer($candidate);

        if ($response === 'accepted') {
            return $this->signing->accept(
                $candidate,
                $offer,
                (string) ($input['name'] ?? ''),
                (string) ($input['code'] ?? ''),
                (bool) ($input['consent'] ?? false),
                $input['ip'] ?? null,
                $input['user_agent'] ?? null
            );
        }

        return $this->offers->recordResponse($offer, null, 'declined', $input['reason'] ?? null, [
            'via' => 'portal',
            'name' => null,
            'ip' => $input['ip'] ?? null,
        ]);
    }

    /** The candidate answers a request to stay on file for future roles. */
    public function answerPoolConsent(Candidate $candidate, bool $granted): Candidate
    {
        return $granted ? $this->pool->grantConsent($candidate) : $this->pool->declineConsent($candidate);
    }

    /** @return array{status: string, can_respond: bool, expires_at: ?string}|null */
    private function presentPool(Candidate $candidate): ?array
    {
        if (! $candidate->talent_pool && $candidate->pool_consent !== 'declined') {
            return null;
        }

        return [
            'status' => $candidate->pool_consent ?? 'unconfirmed',
            'can_respond' => $candidate->anonymized_at === null && $candidate->pool_consent !== 'declined',
            'expires_at' => $candidate->talent_pool_expires_at?->toIso8601String(),
        ];
    }

    public function presentOffer(Offer $offer): array
    {
        return [
            'id' => $offer->id,
            'status' => $offer->status,
            'salary' => $offer->salary,
            'currency' => $offer->currency,
            'start_date' => $offer->start_date?->toDateString(),
            'expires_at' => $offer->expires_at?->toDateString(),
            'benefits' => $offer->benefits ?? [],
            'terms' => $offer->terms,
            'additional_notes' => $offer->additional_notes,
            'sent_at' => $offer->sent_at?->toIso8601String(),
            'responded_at' => $offer->responded_at?->toIso8601String(),
            'can_respond' => $offer->status === 'sent',
            'signature' => $offer->signature_record ? [
                'name' => $offer->signature_record['name'] ?? null,
                'signed_at' => $offer->signature_record['signed_at'] ?? null,
                'document_hash' => $offer->signature_record['document_hash'] ?? null,
            ] : null,
            'consent_statement' => OfferSigningService::CONSENT_STATEMENT,
        ];
    }

    /** @return array{key: string, label: string, message: string} */
    private function status(Candidate $candidate, ?Offer $offer): array
    {
        $base = $this->publicStage($candidate->stage);

        if ($candidate->withdrawn_at) {
            return ['key' => 'withdrawn', 'label' => 'Application withdrawn', 'message' => 'You withdrew this application. Thank you for your time.'];
        }

        if ($candidate->stage === 'offer' && $offer?->status === 'accepted') {
            return ['key' => 'offer_accepted', 'label' => 'Offer accepted', 'message' => 'Thank you for accepting. The team will be in touch about your start date.'];
        }

        return $base;
    }

    /** @return array{key: string, label: string, message: string} */
    private function publicStage(string $stage): array
    {
        return match ($stage) {
            'applied' => ['key' => 'received', 'label' => 'Application received', 'message' => 'We have your application and will review it soon.'],
            'screening' => ['key' => 'in_review', 'label' => 'In review', 'message' => 'The team is reviewing your profile.'],
            'interview' => ['key' => 'interview', 'label' => 'Interviewing', 'message' => 'You are in the interview stage.'],
            'offer' => ['key' => 'offer', 'label' => 'Offer stage', 'message' => 'You have reached the offer stage.'],
            'hired' => ['key' => 'hired', 'label' => 'Welcome aboard', 'message' => 'Congratulations, you are hired!'],
            default => ['key' => 'closed', 'label' => 'Application closed', 'message' => 'Thank you for your interest. We will not be moving forward with your application at this time.'],
        };
    }
}
