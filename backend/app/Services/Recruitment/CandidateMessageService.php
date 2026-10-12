<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateMessage;
use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * A simple message thread between a candidate (through the portal) and the hiring team.
 * Messages live on the candidate record, so the team sees them next to notes and history.
 */
class CandidateMessageService
{
    public function __construct(
        private readonly CandidateMailer $mailer,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    /** The candidate writes to the team; the job's owners (or the whole team) are notified in-app. */
    public function fromCandidate(Candidate $candidate, string $body): CandidateMessage
    {
        $message = CandidateMessage::create([
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'direction' => CandidateMessage::FROM_CANDIDATE,
            'body' => trim($body),
        ]);

        $candidate->loadMissing('jobOpening');
        $recipients = $this->notifications->jobOwnerIds($candidate);

        if ($recipients->isEmpty()) {
            $recipients = $this->notifications->teamIds($candidate->company_id);
        }

        $this->notifications->notifyUsers(
            $recipients->all(),
            'recruitment_message',
            'Message from ' . $candidate->full_name,
            mb_strimwidth($message->body, 0, 140, '…'),
            $candidate->company_id,
            null,
            '/recruitment/candidates/' . $candidate->id
        );

        return $message;
    }

    /** A recruiter writes to the candidate; the candidate is told by email and reads it in the portal. */
    public function fromStaff(Candidate $candidate, User $author, string $body): CandidateMessage
    {
        $message = CandidateMessage::create([
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'direction' => CandidateMessage::FROM_STAFF,
            'user_id' => $author->id,
            'body' => trim($body),
        ]);

        $candidate->loadMissing('jobOpening');

        $lines = [
            $this->mailer->render('Hello {{first_name}},', $candidate),
            $this->mailer->render('You have a new message about your application for {{job}} at {{company}}:', $candidate),
            trim($body),
            'To reply, open your private candidate page. If you no longer have the link, request a new one' . $this->recoveryHint($candidate) . '.',
        ];

        $this->mailer->send($candidate, $this->mailer->render('New message about your application for {{job}}', $candidate), implode("\n\n", $lines));

        return $message;
    }

    /** @return Collection<int, CandidateMessage> */
    public function thread(Candidate $candidate): Collection
    {
        return CandidateMessage::query()->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->with(['author' => fn ($query) => $query->withoutGlobalScopes()])
            ->orderBy('id')
            ->get();
    }

    /** The team opens the thread: everything the candidate wrote counts as read. */
    public function markReadByStaff(Candidate $candidate): void
    {
        CandidateMessage::query()->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->where('direction', CandidateMessage::FROM_CANDIDATE)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    /** The candidate opens the portal: everything the team wrote counts as read. */
    public function markReadByCandidate(Candidate $candidate): void
    {
        CandidateMessage::query()->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->where('direction', CandidateMessage::FROM_STAFF)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    private function recoveryHint(Candidate $candidate): string
    {
        $slug = $candidate->company_id ? Company::query()->whereKey($candidate->company_id)->value('careers_slug') : null;

        return $slug
            ? ' on ' . rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/') . '/careers/' . $slug
            : ' from the hiring team';
    }
}
