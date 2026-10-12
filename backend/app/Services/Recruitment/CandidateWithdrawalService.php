<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\Interview;
use App\Models\InterviewRescheduleRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A candidate takes their own application back. The application is closed as rejected with a
 * clear "withdrawn by candidate" reason so the pipeline and reports stay consistent, open offers
 * are withdrawn and upcoming interviews are cancelled.
 */
class CandidateWithdrawalService
{
    public function __construct(
        private readonly CandidateWorkflowService $workflow,
        private readonly RecruitmentNotificationService $notifications,
        private readonly CandidateMailer $mailer,
    ) {
    }

    public function withdraw(Candidate $candidate, ?string $reason): Candidate
    {
        if ($candidate->stage === 'hired') {
            throw ValidationException::withMessages(['application' => ['You have already been hired. Please contact the hiring team if your plans have changed.']]);
        }

        if ($candidate->stage === 'rejected') {
            throw ValidationException::withMessages(['application' => ['This application is already closed.']]);
        }

        $previous = $candidate->stage;
        $text = 'Withdrawn by the candidate' . (filled($reason) ? ': ' . trim((string) $reason) : '');

        DB::transaction(function () use ($candidate, $text) {
            $this->workflow->changeStage($candidate, 'rejected', null, $text);
            $candidate->forceFill(['withdrawn_at' => now()])->save();

            Interview::query()->withoutGlobalScopes()
                ->where('candidate_id', $candidate->id)->where('status', 'scheduled')
                ->update(['status' => 'cancelled', 'cancel_reason' => 'The candidate withdrew their application.']);

            InterviewRescheduleRequest::query()->withoutGlobalScopes()
                ->where('candidate_id', $candidate->id)->where('status', 'pending')
                ->update(['status' => 'declined', 'resolution_note' => 'The candidate withdrew their application.', 'resolved_at' => now()]);
        });

        $candidate->loadMissing('jobOpening');

        $this->notifications->notifyUsers(
            $this->notifications->jobOwnerIds($candidate)->whenEmpty(fn () => $this->notifications->teamIds($candidate->company_id))->all(),
            'recruitment_stage',
            'Candidate withdrew: ' . $candidate->full_name,
            sprintf('%s withdrew their application for %s (was in %s).', $candidate->full_name, $candidate->jobOpening?->title ?? 'a job', $previous),
            $candidate->company_id,
            null,
            '/recruitment/candidates/' . $candidate->id
        );

        $this->mailer->send($candidate, $this->mailer->render('Your application for {{job}} has been withdrawn', $candidate), implode("\n\n", [
            $this->mailer->render('Hello {{first_name}},', $candidate),
            $this->mailer->render('We have recorded that you withdrew your application for {{job}} at {{company}}. Thank you for your time, and we wish you the best.', $candidate),
        ]));

        return $candidate->refresh();
    }
}
