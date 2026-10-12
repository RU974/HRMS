<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\Offer;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Accepting an offer through the portal is an electronic signature backed by evidence rather
 * than a typed name alone: the candidate proves control of the email address on file with a
 * one-time code, types their name, and agrees to sign electronically. What was signed (a hash of
 * the offer terms), who signed, when, and from which device is stored with the offer.
 *
 * This is an auditable e-signature, not a certified one; whether it is enforceable depends on
 * local law and the employment contract.
 */
class OfferSigningService
{
    public const CODE_MINUTES = 15;

    private const DISK = 'local';

    private const DIRECTORY = 'recruitment/signed-offers';

    public const MAX_ATTEMPTS = 5;

    public const CONSENT_STATEMENT = 'I agree to sign this offer electronically and understand that typing my name below has the same effect as my handwritten signature.';

    public function __construct(
        private readonly OfferService $offers,
        private readonly CandidateMailer $mailer,
    ) {
    }

    /** Email a fresh six-digit code. At most one code per minute. */
    public function sendCode(Candidate $candidate, Offer $offer): string
    {
        $this->assertSignable($offer);

        $issuedAt = $offer->sign_code_expires_at?->copy()->subMinutes(self::CODE_MINUTES);

        if ($issuedAt && $issuedAt->gt(now()->subMinute())) {
            throw ValidationException::withMessages(['code' => ['A code was just sent. Please wait a minute before asking for another.']]);
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $offer->forceFill([
            'sign_code_hash' => $this->hashCode($offer, $code),
            'sign_code_expires_at' => now()->addMinutes(self::CODE_MINUTES),
            'sign_code_attempts' => 0,
        ])->save();

        $sent = $this->mailer->send($candidate, $this->mailer->render('Your code to sign the offer for {{job}}', $candidate), implode("\n\n", [
            $this->mailer->render('Hello {{first_name}},', $candidate),
            'Your verification code is: ' . $code,
            'Enter it on your candidate page to accept the offer. It expires in ' . self::CODE_MINUTES . ' minutes. If you did not ask for this code, you can ignore this email.',
        ]));

        if (! $sent) {
            throw ValidationException::withMessages(['code' => ['We could not email the code. Please try again shortly.']]);
        }

        return $this->maskEmail((string) $candidate->email);
    }

    /** Verify the code and the typed name, store the signature evidence and record the acceptance. */
    public function accept(Candidate $candidate, Offer $offer, string $name, string $code, bool $consent, ?string $ip, ?string $userAgent): Offer
    {
        $this->assertSignable($offer);

        if (! $consent) {
            throw ValidationException::withMessages(['consent' => ['You need to agree to sign electronically.']]);
        }

        $typed = Str::of($name)->squish()->lower()->toString();

        if ($typed === '' || $typed !== Str::of($candidate->full_name)->squish()->lower()->toString()) {
            throw ValidationException::withMessages(['name' => ['Type your full name exactly as shown to accept the offer.']]);
        }

        $this->verifyCode($offer, $code);

        $hash = $this->documentHash($offer, $candidate->full_name);

        $offer->forceFill([
            'document_hash' => $hash,
            'sign_code_hash' => null,
            'sign_code_expires_at' => null,
            'sign_code_attempts' => 0,
            'signature_record' => [
                'name' => $candidate->full_name,
                'email' => $candidate->email,
                'signed_at' => now()->toIso8601String(),
                'ip' => $ip,
                'user_agent' => $userAgent ? mb_substr($userAgent, 0, 255) : null,
                'document_hash' => $hash,
                'consent' => self::CONSENT_STATEMENT,
                'verification' => 'email_code',
            ],
        ])->save();

        $accepted = $this->offers->recordResponse($offer, null, 'accepted', null, [
            'via' => 'portal',
            'name' => $candidate->full_name,
            'ip' => $ip,
        ]);

        return $this->freeze($accepted);
    }

    /**
     * Keep the signed letter exactly as it was signed: store the PDF privately and seal the whole
     * signature record (including the PDF's fingerprint) with a key only the server holds. Anyone
     * who later edits the terms, the record or the stored file makes verify() fail.
     */
    public function freeze(Offer $offer): Offer
    {
        $record = $offer->signature_record ?? [];

        if (! $record) {
            return $offer;
        }

        $pdf = $this->offers->pdf($offer->fresh())->output();
        $path = self::DIRECTORY . '/' . ($offer->company_id ?? 'shared') . '/offer-' . $offer->id . '-signed.pdf';
        Storage::disk(self::DISK)->put($path, $pdf);

        $record['pdf_path'] = $path;
        $record['pdf_hash'] = hash('sha256', $pdf);
        $record['seal'] = $this->seal($record);

        $offer->forceFill(['signature_record' => $record])->save();

        return $offer->fresh();
    }

    /**
     * @return array{signed: bool, valid: bool, seal_valid: bool, terms_unchanged: bool, letter_intact: bool, problems: array<int, string>}
     */
    public function verify(Offer $offer): array
    {
        $record = $offer->signature_record;

        if (! $record) {
            return ['signed' => false, 'valid' => false, 'seal_valid' => false, 'terms_unchanged' => false, 'letter_intact' => false, 'problems' => ['This offer has not been signed.']];
        }

        $problems = [];

        $sealValid = isset($record['seal']) && hash_equals((string) $record['seal'], $this->seal($record));
        $sealValid || $problems[] = 'The signature record was changed after signing.';

        $termsUnchanged = hash_equals((string) ($record['document_hash'] ?? ''), $this->documentHash($offer, (string) ($record['name'] ?? '')));
        $termsUnchanged || $problems[] = 'The offer terms differ from what was signed.';

        $letterIntact = isset($record['pdf_path'], $record['pdf_hash'])
            && Storage::disk(self::DISK)->exists($record['pdf_path'])
            && hash_equals((string) $record['pdf_hash'], hash('sha256', (string) Storage::disk(self::DISK)->get($record['pdf_path'])));
        $letterIntact || $problems[] = 'The stored signed letter is missing or was changed.';

        return [
            'signed' => true,
            'valid' => $sealValid && $termsUnchanged && $letterIntact,
            'seal_valid' => $sealValid,
            'terms_unchanged' => $termsUnchanged,
            'letter_intact' => $letterIntact,
            'problems' => $problems,
        ];
    }

    /** The stored signed letter, if the offer has one. */
    public function signedLetterPath(Offer $offer): ?string
    {
        $path = $offer->signature_record['pdf_path'] ?? null;

        return $path && Storage::disk(self::DISK)->exists($path) ? $path : null;
    }

    /** @param  array<string, mixed>  $record */
    private function seal(array $record): string
    {
        unset($record['seal']);
        ksort($record);

        return hash_hmac('sha256', json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (string) config('app.key'));
    }

    /** Fingerprint of the terms the candidate agreed to. */
    public function documentHash(Offer $offer, string $signerName): string
    {
        return hash('sha256', json_encode([
            'offer' => $offer->id,
            'candidate' => $signerName,
            'salary' => (string) $offer->salary,
            'currency' => $offer->currency,
            'start_date' => $offer->start_date?->toDateString(),
            'expires_at' => $offer->expires_at?->toDateString(),
            'benefits' => $offer->benefits ?? [],
            'terms' => $offer->terms,
            'additional_notes' => $offer->additional_notes,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function verifyCode(Offer $offer, string $code): void
    {
        if (! $offer->sign_code_hash || ! $offer->sign_code_expires_at || $offer->sign_code_expires_at->isPast()) {
            throw ValidationException::withMessages(['code' => ['Ask for a new code first, then enter it here.']]);
        }

        if ((int) $offer->sign_code_attempts >= self::MAX_ATTEMPTS) {
            throw ValidationException::withMessages(['code' => ['Too many wrong attempts. Ask for a new code.']]);
        }

        if (! hash_equals($offer->sign_code_hash, $this->hashCode($offer, trim($code)))) {
            $offer->forceFill(['sign_code_attempts' => (int) $offer->sign_code_attempts + 1])->save();

            throw ValidationException::withMessages(['code' => ['That code is not correct.']]);
        }
    }

    private function assertSignable(Offer $offer): void
    {
        if ($offer->status !== 'sent') {
            throw ValidationException::withMessages(['offer' => ['There is no offer waiting for your answer.']]);
        }

        if ($this->offers->hasLapsed($offer)) {
            $offer->update(['status' => 'expired']);

            throw ValidationException::withMessages(['offer' => ['This offer has expired. Please contact the hiring team.']]);
        }
    }

    private function hashCode(Offer $offer, string $code): string
    {
        return hash_hmac('sha256', $offer->id . ':' . $code, (string) config('app.key'));
    }

    private function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');

        return mb_substr($local, 0, 2) . str_repeat('•', max(1, mb_strlen($local) - 2)) . '@' . $domain;
    }
}
