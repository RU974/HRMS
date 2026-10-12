<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateCheck;
use App\Models\CandidateDocument;
use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Reference checks, background checks and skills assessments, and the rule that a hire waits until the
 * checks the job requires are cleared (passed or waived with a reason).
 */
class CandidateCheckService
{
    public const TOKEN_DAYS = 30;

    /** Questions a referee answers on the public reference form. */
    public const REFERENCE_QUESTIONS = [
        ['key' => 'relationship_duration', 'label' => 'How long and in what capacity did you work with the candidate?', 'type' => 'text', 'required' => true],
        ['key' => 'strengths', 'label' => 'What are their main strengths?', 'type' => 'textarea', 'required' => true],
        ['key' => 'development_areas', 'label' => 'Where could they improve?', 'type' => 'textarea', 'required' => false],
        ['key' => 'reliability', 'label' => 'How reliable were they (attendance, deadlines, follow-through)?', 'type' => 'rating', 'required' => true],
        ['key' => 'overall', 'label' => 'Overall, how would you rate their performance?', 'type' => 'rating', 'required' => true],
        ['key' => 'would_rehire', 'label' => 'Would you work with them again?', 'type' => 'yes_no', 'required' => true],
        ['key' => 'comments', 'label' => 'Anything else we should know?', 'type' => 'textarea', 'required' => false],
    ];

    public function __construct(private readonly RecruitmentNotificationService $notifications)
    {
    }

    /** @return array<int, string> */
    public function requiredTypes(Candidate $candidate): array
    {
        $candidate->loadMissing('jobOpening');

        return array_values(array_intersect(CandidateCheck::TYPES, (array) ($candidate->jobOpening?->required_checks ?? [])));
    }

    /**
     * What stands between this candidate and a hire.
     *
     * @return array<int, array{type: string, reason: string}>
     */
    public function unmet(Candidate $candidate): array
    {
        $checks = CandidateCheck::query()->withoutGlobalScopes()->where('candidate_id', $candidate->id)->get()->groupBy('type');
        $unmet = [];

        foreach ($this->requiredTypes($candidate) as $type) {
            $ofType = $checks->get($type, collect());

            if ($ofType->isEmpty()) {
                $unmet[] = ['type' => $type, 'reason' => sprintf('No %s check has been recorded.', $type)];
                continue;
            }

            $open = $ofType->reject(fn (CandidateCheck $check) => in_array($check->status, CandidateCheck::CLEARED, true));
            if ($open->isNotEmpty()) {
                $unmet[] = ['type' => $type, 'reason' => sprintf('%d %s check(s) not passed or waived yet.', $open->count(), $type)];
            }
        }

        return $unmet;
    }

    public function assertCleared(Candidate $candidate): void
    {
        $unmet = $this->unmet($candidate);

        if ($unmet !== []) {
            throw ValidationException::withMessages([
                'checks' => ['This job requires checks to be cleared before hiring: ' . collect($unmet)->pluck('reason')->implode(' ')],
            ]);
        }
    }

    public function summary(Candidate $candidate): array
    {
        $unmet = collect($this->unmet($candidate));

        return [
            'required' => $this->requiredTypes($candidate),
            'unmet' => $unmet->values(),
            'cleared' => $unmet->isEmpty(),
        ];
    }

    /** Apply a status change and keep completion fields consistent. */
    public function apply(CandidateCheck $check, array $data, ?User $actor = null): CandidateCheck
    {
        $this->assertDocumentBelongs($check->candidate_id, $data['document_id'] ?? null);

        $check->fill(collect($data)->except(['status', 'waive_reason'])->all());

        $status = $data['status'] ?? null;

        // An assessment with a pass mark decides itself once a score is entered.
        if ($status === null && array_key_exists('score', $data) && $check->score !== null && $check->pass_mark !== null) {
            $status = (float) $check->score >= (float) $check->pass_mark ? 'passed' : 'failed';
        }

        if ($status !== null) {
            if ($status === 'waived') {
                throw ValidationException::withMessages(['status' => ['Use the waive action and give a reason.']]);
            }

            $check->status = $status;
        }

        if (in_array($check->status, ['passed', 'failed'], true)) {
            $check->completed_at ??= now();
            $check->completed_by = $actor?->id ?? $check->completed_by;
            $check->waive_reason = null;
        } elseif (in_array($check->status, ['requested', 'in_progress'], true)) {
            $check->completed_at = null;
            $check->completed_by = null;
        }

        $check->save();

        return $check;
    }

    public function waive(CandidateCheck $check, string $reason, ?User $actor = null): CandidateCheck
    {
        $check->forceFill([
            'status' => 'waived',
            'waive_reason' => trim($reason),
            'completed_at' => now(),
            'completed_by' => $actor?->id,
        ])->save();

        return $check;
    }

    public function assertDocumentBelongs(int $candidateId, mixed $documentId): void
    {
        if ($documentId === null || $documentId === '') {
            return;
        }

        $belongs = CandidateDocument::query()->withoutGlobalScopes()->whereKey($documentId)->where('candidate_id', $candidateId)->exists();

        if (! $belongs) {
            throw ValidationException::withMessages(['document_id' => ['That document does not belong to this candidate.']]);
        }
    }

    /**
     * Email the referee a private link to the questionnaire. Issuing a new link replaces the old one.
     *
     * @return array{sent: bool, url: string}
     */
    public function sendReferenceRequest(CandidateCheck $check, ?User $actor = null): array
    {
        if ($check->type !== 'reference' || ! filled($check->contact_email)) {
            throw ValidationException::withMessages(['contact_email' => ['A reference check needs the referee\'s email address.']]);
        }

        if (in_array($check->status, CandidateCheck::CLEARED, true)) {
            throw ValidationException::withMessages(['status' => ['This reference check is already closed.']]);
        }

        $token = Str::random(48);
        $check->forceFill([
            'response_token_hash' => hash('sha256', $token),
            'response_token_expires_at' => now()->addDays(self::TOKEN_DAYS),
            'requested_at' => now(),
            'requested_by' => $actor?->id ?? $check->requested_by,
        ])->save();

        $url = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/') . '/reference/' . $token;

        $candidate = Candidate::query()->withoutGlobalScopes()->with('jobOpening')->find($check->candidate_id);
        $company = $candidate?->company_id ? Company::query()->whereKey($candidate->company_id)->value('name') : null;

        $body = implode("\n\n", [
            'Hello ' . (explode(' ', trim((string) $check->contact_name))[0] ?: 'there') . ',',
            sprintf(
                '%s has applied for %s%s and named you as a reference. Would you share a few minutes of feedback about working with them?',
                $candidate?->full_name ?? 'A candidate',
                $candidate?->jobOpening?->title ?? 'a role',
                $company ? ' at ' . $company : ''
            ),
            'Your answers go only to the hiring team: ' . $url,
            'The link is private to you and expires in ' . self::TOKEN_DAYS . ' days.',
        ]);

        $sent = false;
        try {
            Mail::raw($body, function ($message) use ($check, $candidate) {
                $message->to($check->contact_email, $check->contact_name)->subject('Reference request for ' . ($candidate?->full_name ?? 'a candidate'));
            });
            $sent = true;
        } catch (Throwable $exception) {
            Log::warning('Reference request email failed: ' . $exception->getMessage());
        }

        return ['sent' => $sent, 'url' => $url];
    }

    public function resolveByToken(string $token): CandidateCheck
    {
        $check = CandidateCheck::query()
            ->withoutGlobalScopes()
            ->where('type', 'reference')
            ->where('response_token_hash', hash('sha256', $token))
            ->where('response_token_expires_at', '>', now())
            ->first();

        abort_unless($check, 404, 'This link is not valid or has expired.');

        return $check;
    }

    /** @param  array<string, mixed>  $answers */
    public function recordReferenceResponse(CandidateCheck $check, array $answers): CandidateCheck
    {
        if ($check->response !== null || in_array($check->status, CandidateCheck::CLEARED, true) || $check->status === 'failed') {
            throw ValidationException::withMessages(['reference' => ['This reference has already been submitted. Thank you!']]);
        }

        $check->forceFill([
            'response' => $answers + ['submitted_at' => now()->toIso8601String()],
            // The hiring team still decides whether the reference is a pass.
            'status' => 'in_progress',
            'response_token_hash' => null,
            'response_token_expires_at' => null,
        ])->save();

        $candidate = Candidate::query()->withoutGlobalScopes()->with('jobOpening')->find($check->candidate_id);
        if ($candidate) {
            $this->notifications->notifyOwners(
                $candidate,
                'recruitment_check',
                'Reference received: ' . $candidate->full_name,
                sprintf('%s answered the reference request for %s.', $check->contact_name ?: 'A referee', $candidate->full_name)
            );
        }

        return $check;
    }
}
