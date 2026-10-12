<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\CandidateDocument;
use App\Models\Offer;
use App\Services\Recruitment\CandidateDocumentService;
use App\Services\Recruitment\CandidateMessageService;
use App\Services\Recruitment\CandidateRetentionService;
use App\Services\Recruitment\CandidateWithdrawalService;
use App\Services\Recruitment\InterviewRescheduleService;
use App\Services\Recruitment\CandidatePortalService;
use App\Services\Recruitment\OfferService;
use App\Services\Recruitment\RecruitmentNotificationService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Unauthenticated candidate portal. Every request is tied to one candidate by the secret token
 * in the URL, and nothing internal (notes, ratings, scorecards, rejection reasons) is returned.
 */
class CandidatePortalController extends Controller
{
    public function __construct(
        private readonly CandidatePortalService $portal,
        private readonly CandidateDocumentService $documents,
        private readonly CandidateMessageService $messages,
    ) {
    }

    public function show(string $token)
    {
        $candidate = $this->portal->resolve($token);
        $view = $this->portal->present($candidate);

        // Opening the page counts as reading what the team wrote; the unread count above was taken first.
        $this->messages->markReadByCandidate($candidate);

        return $this->ok($view);
    }

    /** Email the one-time code used to sign an offer. */
    public function sendSigningCode(string $token)
    {
        $masked = $this->portal->sendSigningCode($this->portal->resolve($token));

        return $this->ok(['email' => $masked], 'We emailed you a code');
    }

    public function respondToOffer(Request $request, string $token)
    {
        $candidate = $this->portal->resolve($token);

        $validated = $request->validate([
            'response' => 'required|in:accepted,declined',
            'name' => 'required_if:response,accepted|nullable|string|max:255',
            'code' => 'required_if:response,accepted|nullable|string|max:12',
            'consent' => 'required_if:response,accepted|nullable|boolean',
            'reason' => 'nullable|string|max:1000',
        ]);

        $offer = $this->portal->respondToOffer($candidate, $validated['response'], [
            'name' => $validated['name'] ?? null,
            'code' => $validated['code'] ?? null,
            'consent' => (bool) ($validated['consent'] ?? false),
            'reason' => $validated['reason'] ?? null,
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return $this->ok($this->portal->presentOffer($offer), $validated['response'] === 'accepted' ? 'Offer accepted. Welcome aboard!' : 'Offer declined');
    }

    /** The candidate asks to move an upcoming interview. */
    public function requestReschedule(Request $request, string $token, int $interview)
    {
        $candidate = $this->portal->resolve($token);

        $validated = $request->validate([
            'note' => 'nullable|string|max:1000',
            'proposed_times' => 'nullable|array|max:3',
            'proposed_times.*' => 'date',
        ]);

        app(InterviewRescheduleService::class)->request($candidate, $interview, $validated['note'] ?? null, $validated['proposed_times'] ?? []);

        return $this->ok(null, 'Your request was sent to the hiring team', 201);
    }

    public function withdraw(Request $request, string $token)
    {
        $candidate = $this->portal->resolve($token);
        $validated = $request->validate(['reason' => 'nullable|string|max:1000']);

        app(CandidateWithdrawalService::class)->withdraw($candidate, $validated['reason'] ?? null);

        return $this->ok($this->portal->present($candidate->refresh()), 'Your application was withdrawn');
    }

    public function sendMessage(Request $request, string $token)
    {
        $candidate = $this->portal->resolve($token);
        $validated = $request->validate(['body' => 'required|string|max:3000']);

        $this->messages->fromCandidate($candidate, $validated['body']);

        return $this->ok($this->portal->present($candidate), 'Message sent', 201);
    }

    /** Stay on file for future roles (yes) or not (no). */
    public function answerTalentPool(Request $request, string $token)
    {
        $candidate = $this->portal->resolve($token);
        $validated = $request->validate(['consent' => 'required|boolean']);

        $this->portal->answerPoolConsent($candidate, (bool) $validated['consent']);

        return $this->ok($this->portal->present($candidate->refresh()), $validated['consent'] ? 'Thank you. We will keep your details on file.' : 'Understood. We will not keep your details for other roles.');
    }

    /** The candidate asks for all of their personal data to be erased. */
    public function erase(Request $request, string $token)
    {
        $candidate = $this->portal->resolve($token);
        $request->validate(['confirm' => 'required|accepted']);

        app(CandidateRetentionService::class)->anonymize($candidate);

        return $this->ok(null, 'Your data was erased');
    }

    public function offerPdf(string $token)
    {
        $candidate = $this->portal->resolve($token);

        $offer = Offer::query()
            ->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->whereIn('status', ['sent', 'accepted', 'declined'])
            ->latest('id')
            ->firstOrFail();

        return app(OfferService::class)->download($offer, 'offer-letter.pdf');
    }

    public function upload(Request $request, string $token)
    {
        $candidate = $this->portal->resolve($token);

        if ($candidate->stage === 'rejected' || $candidate->status !== 'active') {
            throw ValidationException::withMessages(['document' => ['Uploads are closed for this application.']]);
        }

        $validated = $request->validate([
            'file' => CandidateDocumentService::VALIDATION_RULES,
            'document_id' => 'nullable|integer',
            'label' => 'nullable|string|max:120',
        ]);

        $document = null;

        if (! empty($validated['document_id'])) {
            $document = CandidateDocument::query()->withoutGlobalScopes()
                ->where('candidate_id', $candidate->id)
                ->findOrFail($validated['document_id']);
        } elseif (! filled($validated['label'] ?? null)) {
            throw ValidationException::withMessages(['label' => ['Tell us what this document is.']]);
        }

        $document = $this->documents->store($candidate, $request->file('file'), $document, $validated['label'] ?? null, 'candidate');

        $candidate->loadMissing('jobOpening');
        app(RecruitmentNotificationService::class)->notifyUsers(
            $candidate->jobOpening ? app(RecruitmentNotificationService::class)->jobOwnerIds($candidate)->all() : [],
            'recruitment_document',
            'Document uploaded: ' . $candidate->full_name,
            sprintf('%s uploaded "%s".', $candidate->full_name, $document->label),
            $candidate->company_id,
            null,
            '/recruitment/candidates/' . $candidate->id
        );

        return $this->ok($document->only(['id', 'label', 'status', 'original_name', 'uploaded_at']), 'Document uploaded', 201);
    }

    public function download(string $token, int $document)
    {
        $candidate = $this->portal->resolve($token);

        $file = CandidateDocument::query()->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->findOrFail($document);

        return $this->documents->respond($file);
    }
}
