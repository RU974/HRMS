<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use App\Models\CandidateNote;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Apply one action to many candidates. Every candidate is handled on its own, so a candidate
 * that cannot take the action (wrong stage, no email...) is reported without blocking the rest.
 */
class CandidateBulkService
{
    public const ACTIONS = ['move', 'reject', 'tag', 'untag', 'talent_pool', 'remove_from_pool', 'email'];

    public const MAX_CANDIDATES = 200;

    public const MAX_EMAILS = 100;

    public function __construct(
        private readonly CandidateWorkflowService $workflow,
        private readonly TalentPoolService $pool,
        private readonly CandidateMailer $mailer,
        private readonly RecruitmentNotificationService $notifications,
    ) {
    }

    /**
     * @param  array<int, int|string>  $ids
     * @param  array<string, mixed>  $params
     * @return array{action: string, requested: int, succeeded: array<int, int>, failed: array<int, array{id: int, name: ?string, reason: string}>}
     */
    public function run(array $ids, string $action, array $params, User $actor): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $candidates = Candidate::query()->whereIn('id', $ids)->get()->keyBy('id');

        $succeeded = [];
        $failed = [];

        foreach ($ids as $id) {
            $candidate = $candidates->get($id);

            if (! $candidate) {
                $failed[] = ['id' => $id, 'name' => null, 'reason' => 'Candidate not found.'];

                continue;
            }

            try {
                DB::transaction(fn () => $this->apply($candidate, $action, $params, $actor));
                $succeeded[] = $id;
            } catch (ValidationException $exception) {
                $failed[] = ['id' => $id, 'name' => $candidate->full_name, 'reason' => collect($exception->errors())->flatten()->first() ?? 'Invalid request.'];
            } catch (HttpExceptionInterface $exception) {
                $failed[] = ['id' => $id, 'name' => $candidate->full_name, 'reason' => $exception->getMessage() ?: 'Not allowed.'];
            } catch (Throwable $exception) {
                report($exception);
                $failed[] = ['id' => $id, 'name' => $candidate->full_name, 'reason' => 'Unexpected error.'];
            }
        }

        return ['action' => $action, 'requested' => count($ids), 'succeeded' => $succeeded, 'failed' => $failed];
    }

    private function apply(Candidate $candidate, string $action, array $params, User $actor): void
    {
        match ($action) {
            'move' => $this->move($candidate, (string) $params['stage'], $actor),
            'reject' => $this->reject($candidate, (string) $params['reason'], $params['talent_pool'] ?? null, $actor),
            'tag' => $this->retag($candidate, $params['tags'], true),
            'untag' => $this->retag($candidate, $params['tags'], false),
            'talent_pool' => $this->pool->add($candidate, (string) $params['pool'], $params['note'] ?? null),
            'remove_from_pool' => $this->pool->remove($candidate),
            'email' => $this->email($candidate, (string) $params['subject'], (string) $params['body'], $actor),
        };
    }

    private function move(Candidate $candidate, string $stage, User $actor): void
    {
        if ($stage === 'rejected') {
            throw ValidationException::withMessages(['stage' => ['Use the reject action so a reason is recorded.']]);
        }

        $from = $candidate->stage;
        $this->workflow->assertCanMove($candidate, $stage);

        if ($this->workflow->isReopen($from, $stage) && ! $actor->hasAnyRole([User::ROLE_SUPER_ADMIN]) && ! $actor->hasPermission('recruitment:edit')) {
            abort(403, 'You are not authorized to reopen a rejected candidate.');
        }

        $this->workflow->changeStage($candidate, $stage, $actor->id);
        $this->notifications->stageChanged($candidate, $from, $actor->id);
    }

    private function reject(Candidate $candidate, string $reason, ?string $pool, User $actor): void
    {
        $from = $candidate->stage;
        $this->workflow->assertCanMove($candidate, 'rejected');
        $this->workflow->changeStage($candidate, 'rejected', $actor->id, $reason);

        if ($pool) {
            $this->pool->add($candidate, $pool);
        }

        $this->notifications->stageChanged($candidate, $from, $actor->id);
    }

    private function retag(Candidate $candidate, array $tags, bool $add): void
    {
        $tags = array_values(array_unique(array_filter(array_map('trim', $tags))));
        $current = $candidate->tags ?? [];

        $next = $add
            ? array_values(array_unique(array_merge($current, $tags)))
            : array_values(array_diff($current, $tags));

        if (count($next) > 20) {
            throw ValidationException::withMessages(['tags' => ['A candidate can have at most 20 tags.']]);
        }

        $candidate->update(['tags' => $next]);
    }

    private function email(Candidate $candidate, string $subject, string $body, User $actor): void
    {
        if (! filled($candidate->email)) {
            throw ValidationException::withMessages(['email' => ['This candidate has no email address.']]);
        }

        if (! $this->mailer->send($candidate, $this->mailer->render($subject, $candidate), $this->mailer->render($body, $candidate))) {
            throw ValidationException::withMessages(['email' => ['The email could not be sent.']]);
        }

        CandidateNote::create([
            'company_id' => $candidate->company_id,
            'candidate_id' => $candidate->id,
            'user_id' => $actor->id,
            'body' => 'Emailed the candidate: ' . $this->mailer->render($subject, $candidate),
        ]);
    }
}
