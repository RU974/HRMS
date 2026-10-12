<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Plain-text email to a candidate. A failing mail server must never undo the recruitment
 * action that triggered the message, so errors are logged and reported as `false`.
 */
class CandidateMailer
{
    public function send(Candidate $candidate, string $subject, string $body): bool
    {
        if (! filled($candidate->email)) {
            return false;
        }

        try {
            Mail::raw($body, function ($message) use ($candidate, $subject) {
                $message->to($candidate->email, $candidate->full_name)->subject($subject);
            });

            return true;
        } catch (Throwable $exception) {
            Log::warning('Candidate email failed: ' . $exception->getMessage());

            return false;
        }
    }

    /** Replace {{name}}, {{first_name}}, {{job}} and {{company}} in a template. */
    public function render(string $template, Candidate $candidate): string
    {
        $candidate->loadMissing('jobOpening');
        $company = $candidate->company_id ? \App\Models\Company::query()->whereKey($candidate->company_id)->value('name') : null;

        return strtr($template, [
            '{{name}}' => $candidate->full_name,
            '{{first_name}}' => explode(' ', trim($candidate->full_name))[0] ?? $candidate->full_name,
            '{{job}}' => $candidate->jobOpening?->title ?? 'the role',
            '{{company}}' => $company ?? 'our company',
        ]);
    }
}
