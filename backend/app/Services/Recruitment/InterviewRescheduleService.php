<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\Interview;
use App\Models\InterviewRescheduleRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * A candidate cannot change an interview themselves, but they can ask. The request lands with the
 * interviewer and the job owners; staff then move the interview (which closes the request
 * automatically and tells the candidate) or decline.
 */
class InterviewRescheduleService
{
    public function __construct(
        private readonly CandidateMailer $mailer,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    /** @param  array<int, string>  $proposedTimes */
    public function request(Candidate $candidate, int $interviewId, ?string $note, array $proposedTimes): InterviewRescheduleRequest
    {
        $interview = Interview::query()->withoutGlobalScopes()
            ->where('candidate_id', $candidate->id)
            ->find($interviewId);

        if (! $interview) {
            throw ValidationException::withMessages(['interview_id' => ['That interview was not found.']]);
        }

        if ($interview->status !== 'scheduled' || ! $interview->scheduled_at || $interview->scheduled_at->isPast()) {
            throw ValidationException::withMessages(['interview_id' => ['Only an upcoming interview can be rescheduled.']]);
        }

        $alreadyAsked = InterviewRescheduleRequest::query()->withoutGlobalScopes()
            ->where('interview_id', $interview->id)->where('status', 'pending')->exists();

        if ($alreadyAsked) {
            throw ValidationException::withMessages(['interview_id' => ['You have already asked to reschedule this interview. The team will get back to you.']]);
        }

        $proposed = collect($proposedTimes)
            ->map(fn ($time) => Carbon::parse($time))
            ->filter(fn (Carbon $time) => $time->isFuture())
            ->map(fn (Carbon $time) => $time->toIso8601String())
            ->take(3)->values()->all();

        if (! filled($note) && ! $proposed) {
            throw ValidationException::withMessages(['note' => ['Tell us why, or suggest a better time.']]);
        }

        $request = InterviewRescheduleRequest::create([
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'interview_id' => $interview->id,
            'note' => filled($note) ? trim((string) $note) : null,
            'proposed_times' => $proposed ?: null,
            'status' => 'pending',
        ]);

        $interview->loadMissing(['interviewer']);
        $candidate->loadMissing('jobOpening');

        $this->notifications->notifyUsers(
            collect([$interview->interviewer?->user_id, $interview->created_by])->merge($this->notifications->jobOwnerIds($candidate))->all(),
            'recruitment_interview',
            'Reschedule requested: ' . $candidate->full_name,
            sprintf('%s asked to move the interview on %s.', $candidate->full_name, $interview->scheduled_at->format('D, d M Y H:i')),
            $candidate->company_id,
            null,
            '/recruitment/candidates/' . $candidate->id
        );

        return $request;
    }

    /** Staff close a request without moving the interview. */
    public function decline(InterviewRescheduleRequest $request, User $actor, ?string $note): InterviewRescheduleRequest
    {
        $this->assertPending($request);

        $request->update(['status' => 'declined', 'resolved_by' => $actor->id, 'resolution_note' => $note, 'resolved_at' => now()]);

        $candidate = Candidate::query()->withoutGlobalScopes()->find($request->candidate_id);

        if ($candidate) {
            $this->mailer->send($candidate, $this->mailer->render('About your interview for {{job}}', $candidate), implode("\n\n", array_filter([
                $this->mailer->render('Hello {{first_name}},', $candidate),
                'We are not able to move your interview, so the original time still stands.',
                $note ? 'Note from the team: ' . $note : null,
                'If you cannot make it, please reply to the hiring team.',
            ])));
        }

        return $request;
    }

    /** Called when an interview has been moved: open requests are answered and the candidate hears the new time. */
    public function interviewMoved(Interview $interview, ?int $actorId): void
    {
        $open = InterviewRescheduleRequest::query()->withoutGlobalScopes()
            ->where('interview_id', $interview->id)->where('status', 'pending')->get();

        if ($open->isEmpty()) {
            return;
        }

        foreach ($open as $request) {
            $request->update(['status' => 'resolved', 'resolved_by' => $actorId, 'resolved_at' => now(), 'resolution_note' => 'Interview rescheduled.']);
        }

        $candidate = Candidate::query()->withoutGlobalScopes()->find($interview->candidate_id);

        if ($candidate) {
            $this->mailer->send($candidate, $this->mailer->render('Your interview for {{job}} has a new time', $candidate), implode("\n\n", array_filter([
                $this->mailer->render('Hello {{first_name}},', $candidate),
                'Your interview has been rescheduled to ' . $interview->scheduled_at?->format('l, d M Y \a\t H:i') . ' (' . ($interview->duration_minutes ?: 60) . ' minutes).',
                $interview->location ? 'Location: ' . $interview->location : null,
                $interview->meeting_link ? 'Meeting link: ' . $interview->meeting_link : null,
            ])));
        }
    }

    private function assertPending(InterviewRescheduleRequest $request): void
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['status' => ['This request has already been answered.']]);
        }
    }
}
