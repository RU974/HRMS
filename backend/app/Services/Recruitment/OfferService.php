<?php

namespace App\Services\Recruitment;

use App\Models\Approval;
use App\Models\ApprovalResponse;
use App\Models\ApprovalStep;
use App\Models\Candidate;
use App\Models\Company;
use App\Models\Offer;
use App\Models\User;
use App\Models\Workflow;
use App\Services\ApprovalEngine;
use App\Services\WorkflowEngine;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OfferService
{
    /** Roles allowed to decide on an offer; mirrors the approval step created below. */
    public const APPROVER_ROLES = [User::ROLE_HR_MANAGER, User::ROLE_COMPANY_ADMIN];

    public function __construct(
        private readonly CandidateWorkflowService $workflow,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    public function activeOfferFor(Candidate $candidate): ?Offer
    {
        return Offer::query()
            ->where('candidate_id', $candidate->id)
            ->whereIn('status', Offer::ACTIVE_STATUSES)
            ->latest('id')
            ->first();
    }

    public function acceptedOfferFor(Candidate $candidate): ?Offer
    {
        return Offer::query()
            ->where('candidate_id', $candidate->id)
            ->where('status', 'accepted')
            ->latest('id')
            ->first();
    }

    public function create(Candidate $candidate, array $data, User $actor): Offer
    {
        if (! in_array($candidate->stage, ['interview', 'offer'], true)) {
            throw ValidationException::withMessages(['candidate_id' => ['Offers can only be made to candidates in the interview or offer stage.']]);
        }

        if ($this->activeOfferFor($candidate)) {
            throw ValidationException::withMessages(['candidate_id' => ['This candidate already has an active offer. Withdraw it before creating a new one.']]);
        }

        return Offer::create([
            ...$data,
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'created_by' => $actor->id,
            'status' => 'draft',
        ]);
    }

    public function update(Offer $offer, array $data): Offer
    {
        if (! $offer->isEditable()) {
            throw ValidationException::withMessages(['status' => ['Only draft or rejected offers can be edited.']]);
        }

        $offer->update($data);

        return $offer;
    }

    public function submitForApproval(Offer $offer, User $actor): Offer
    {
        if (! $offer->isEditable()) {
            throw ValidationException::withMessages(['status' => ['Only draft or rejected offers can be submitted for approval.']]);
        }

        if (! $offer->start_date) {
            throw ValidationException::withMessages(['start_date' => ['Set a start date before submitting the offer for approval.']]);
        }

        $offer->loadMissing('candidate.jobOpening');

        DB::transaction(function () use ($offer, $actor) {
            $approval = (new WorkflowEngine())->startWorkflow(
                Offer::APPROVAL_MODULE,
                $offer->id,
                $this->workflowFor($offer->company_id),
                $actor->id,
                [
                    'candidate' => $offer->candidate?->full_name,
                    'job' => $offer->candidate?->jobOpening?->title,
                    'salary' => (float) $offer->salary,
                    'currency' => $offer->currency,
                ]
            );

            $offer->update(['status' => 'pending_approval', 'approval_id' => $approval->id, 'approval_note' => null]);
        });

        $approverIds = User::query()
            ->where('company_id', $offer->company_id)
            ->whereHas('roles', fn ($query) => $query->whereIn('name', self::APPROVER_ROLES))
            ->pluck('id')
            ->all();

        $this->notifications->notifyUsers(
            $approverIds,
            'recruitment_offer',
            'Offer awaiting approval: ' . ($offer->candidate?->full_name ?? 'candidate'),
            sprintf('An offer of %s %s for %s needs your approval.', $offer->currency, number_format((float) $offer->salary, 2), $offer->candidate?->jobOpening?->title ?? 'a role'),
            $offer->company_id,
            $actor->id,
            '/recruitment/offers'
        );

        return $offer->fresh();
    }

    public function decide(Offer $offer, User $actor, bool $approve, ?string $note = null): Offer
    {
        if ($offer->status !== 'pending_approval' || ! $offer->approval_id) {
            throw ValidationException::withMessages(['status' => ['This offer is not waiting for approval.']]);
        }

        $approval = Approval::query()->findOrFail($offer->approval_id);

        if ($approval->status !== 'pending') {
            throw ValidationException::withMessages(['status' => ['This approval has already been completed.']]);
        }

        $isAdmin = $actor->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN]);

        if (! $isAdmin && ! $actor->hasAnyRole(self::APPROVER_ROLES)) {
            abort(403, 'Only an HR Manager or Company Admin can approve offers.');
        }

        if (! $isAdmin && (int) $approval->requested_by === (int) $actor->id) {
            abort(403, 'You cannot approve an offer that you submitted yourself.');
        }

        $engine = new ApprovalEngine();
        $approve ? $engine->approve($approval, $actor->id, ['notes' => $note]) : $engine->reject($approval, $actor->id, ['notes' => $note]);

        // The ApprovalApproved/Rejected listener does the same; applying it here keeps the
        // result deterministic for this request and the call is idempotent.
        return $this->applyApprovalResult($approval->fresh()) ?? $offer->fresh();
    }

    /**
     * Mirror the final outcome of an approval onto its offer. Safe to call repeatedly and
     * for approvals that do not belong to an offer.
     */
    public function applyApprovalResult(Approval $approval): ?Offer
    {
        if ($approval->module !== Offer::APPROVAL_MODULE) {
            return null;
        }

        $offer = Offer::query()->withoutGlobalScopes()->find($approval->module_id);

        if (! $offer || (int) $offer->approval_id !== (int) $approval->id || $offer->status !== 'pending_approval') {
            return $offer;
        }

        if ($approval->status === 'approved') {
            $offer->update(['status' => 'approved']);
        } elseif ($approval->status === 'rejected') {
            $note = ApprovalResponse::query()
                ->where('approval_id', $approval->id)
                ->where('decision', 'reject')
                ->latest('id')
                ->value('notes');

            $offer->update(['status' => 'rejected', 'approval_note' => $note]);
        } else {
            return $offer;
        }

        $offer->loadMissing('candidate');
        $this->notifications->notifyUsers(
            [$offer->created_by],
            'recruitment_offer',
            sprintf('Offer %s: %s', $offer->status, $offer->candidate?->full_name ?? 'candidate'),
            $offer->status === 'approved'
                ? 'The offer was approved. You can now send it to the candidate.'
                : 'The offer was rejected' . ($offer->approval_note ? ': ' . $offer->approval_note : '.'),
            $offer->company_id,
            null,
            '/recruitment/offers'
        );

        return $offer->fresh();
    }

    public function markSent(Offer $offer, User $actor): Offer
    {
        if ($offer->status !== 'approved') {
            throw ValidationException::withMessages(['status' => ['Only approved offers can be sent to the candidate.']]);
        }

        DB::transaction(function () use ($offer, $actor) {
            $offer->update(['status' => 'sent', 'sent_at' => now()]);
            $this->moveCandidateToOfferStage($offer, $actor);
        });

        return $offer->fresh();
    }

    /**
     * Record the candidate's answer. $actor is the staff member entering it on their behalf; it is
     * null when the candidate answered themselves through the portal.
     *
     * @param  array{via?: string, name?: ?string, ip?: ?string}  $meta
     */
    public function recordResponse(Offer $offer, ?User $actor, string $response, ?string $reason = null, array $meta = []): Offer
    {
        if ($offer->status !== 'sent') {
            throw ValidationException::withMessages(['status' => ['Only sent offers can be accepted or declined.']]);
        }

        DB::transaction(function () use ($offer, $actor, $response, $reason, $meta) {
            $offer->update([
                'status' => $response,
                'responded_at' => now(),
                'decline_reason' => $response === 'declined' ? $reason : null,
                'responded_via' => $meta['via'] ?? 'staff',
                'response_name' => $meta['name'] ?? null,
                'response_ip' => $meta['ip'] ?? null,
            ]);

            if ($response === 'accepted') {
                $this->moveCandidateToOfferStage($offer, $actor);
            }
        });

        $offer->loadMissing('candidate');
        $this->notifications->notifyUsers(
            collect([$offer->created_by])->merge($offer->candidate ? $this->notifications->jobOwnerIds($offer->candidate) : [])->all(),
            'recruitment_offer',
            sprintf('Offer %s: %s', $response, $offer->candidate?->full_name ?? 'candidate'),
            $response === 'accepted'
                ? 'The candidate accepted the offer. You can now hire them.'
                : 'The candidate declined the offer' . ($reason ? ': ' . $reason : '.'),
            $offer->company_id,
            $actor?->id,
            '/recruitment/candidates/' . $offer->candidate_id
        );

        return $offer->fresh();
    }

    public function withdraw(Offer $offer): Offer
    {
        if (! in_array($offer->status, ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted'], true)) {
            throw ValidationException::withMessages(['status' => ['This offer can no longer be withdrawn.']]);
        }

        if ($offer->candidate()->withoutGlobalScopes()->value('stage') === 'hired') {
            throw ValidationException::withMessages(['status' => ['The candidate has already been hired.']]);
        }

        DB::transaction(function () use ($offer) {
            if ($offer->status === 'pending_approval' && $offer->approval_id) {
                Approval::query()->whereKey($offer->approval_id)->where('status', 'pending')
                    ->update(['status' => 'rejected', 'rejected_at' => now()]);
            }

            $offer->update(['status' => 'withdrawn']);
        });

        return $offer->fresh();
    }

    public function withdrawForCandidate(Candidate $candidate): void
    {
        Offer::query()
            ->where('candidate_id', $candidate->id)
            ->whereIn('status', ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted'])
            ->get()
            ->each(fn (Offer $offer) => $this->withdraw($offer));
    }

    /** True once the last day to answer has passed. */
    public function hasLapsed(Offer $offer): bool
    {
        return $offer->expires_at !== null && $offer->expires_at->lt(now()->startOfDay());
    }

    public function expireStale(): int
    {
        return Offer::query()
            ->withoutGlobalScopes()
            ->where('status', 'sent')
            ->whereNotNull('expires_at')
            ->whereDate('expires_at', '<', now()->toDateString())
            ->update(['status' => 'expired']);
    }

    /** The letter as a download: the frozen copy once it is signed, otherwise a fresh render. */
    public function download(Offer $offer, string $filename)
    {
        $path = app(OfferSigningService::class)->signedLetterPath($offer);

        return $path
            ? \Illuminate\Support\Facades\Storage::disk('local')->download($path, $filename)
            : $this->pdf($offer)->download($filename);
    }

    public function pdf(Offer $offer)
    {
        $offer->loadMissing('candidate.jobOpening.department');
        $candidate = $offer->candidate;

        return Pdf::loadView('recruitment.offer-letter', [
            'offer' => $offer,
            'candidate' => $candidate,
            'job' => $candidate?->jobOpening,
            'department' => $candidate?->jobOpening?->department?->name,
            'company' => $offer->company_id ? Company::find($offer->company_id) : null,
        ])->setPaper('a4');
    }

    private function moveCandidateToOfferStage(Offer $offer, ?User $actor): void
    {
        $candidate = Candidate::query()->withoutGlobalScopes()->find($offer->candidate_id);

        if ($candidate && $candidate->stage === 'interview') {
            $this->workflow->changeStage($candidate, 'offer', $actor?->id, null, null, true);
        }
    }

    /** One approval step ("HR Manager") per company, created the first time an offer is submitted. */
    private function workflowFor(?string $companyId): Workflow
    {
        $workflow = Workflow::firstOrCreate(
            ['module' => Offer::APPROVAL_MODULE, 'company_id' => $companyId],
            ['name' => 'Offer approval', 'definition' => ['description' => 'Approval of candidate offers before they are sent', 'notifications' => 'module']]
        );

        if (! $workflow->steps()->exists()) {
            ApprovalStep::create([
                'workflow_id' => $workflow->id,
                'step_order' => 1,
                'approver_type' => 'role',
                'approver_identifier' => User::ROLE_HR_MANAGER,
                'conditions' => [],
                'required_approvals' => 1,
            ]);
        }

        return $workflow;
    }
}
