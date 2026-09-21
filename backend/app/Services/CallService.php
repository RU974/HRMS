<?php

namespace App\Services;

use App\Events\CallEnded;
use App\Events\CallHandledElsewhere;
use App\Events\CallUpdated;
use App\Models\Call;
use App\Models\CallParticipant;
use App\Models\CallSignal;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Owns the call state machine so the HTTP controller and the scheduled
 * cleanup command apply exactly the same rules.
 *
 * Call statuses:  ringing -> active -> ended
 *                 ringing -> missed    (host cancelled / nobody answered in time)
 *                 ringing -> declined  (every invitee rejected)
 * Participant statuses: invited -> joined -> left,  invited -> rejected
 */
class CallService
{
    public function __construct(private readonly CallNotificationService $notifications)
    {
    }

    /**
     * Shape sent to clients over HTTP and websockets.
     */
    public function format(Call $call): array
    {
        $call->loadMissing(['initiator:id,name,email', 'callParticipants.user:id,name,email']);

        return [
            'id' => $call->id,
            'conversation_id' => $call->conversation_id,
            'initiated_by' => $call->initiated_by,
            'host_id' => $call->currentHostId(),
            'initiator' => $call->initiator,
            'type' => $call->type,
            'call_type' => $call->call_type,
            'status' => $call->status,
            'participants' => $call->callParticipants->map(fn ($p) => [
                'user_id' => $p->user_id,
                'user' => $p->user,
                'status' => $p->status,
                'joined_at' => $p->joined_at,
                'left_at' => $p->left_at,
            ])->values(),
            'started_at' => $call->started_at,
            'ended_at' => $call->ended_at,
            'duration' => $call->duration(),
            'created_at' => $call->created_at,
        ];
    }

    /**
     * Subset of $userIds currently invited to / joined on a ringing or active call.
     *
     * @param  int[]  $userIds
     * @return int[]
     */
    public function busyUserIds(array $userIds): array
    {
        return CallParticipant::query()
            ->whereIn('user_id', $userIds)
            ->whereIn('status', ['invited', 'joined'])
            ->whereHas('call', fn ($q) => $q->whereIn('status', ['ringing', 'active']))
            ->pluck('user_id')
            ->unique()
            ->values()
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * A participant leaves (or is dropped from) a call. Ends the call when
     * nobody meaningful is left, otherwise hands the host role on if needed
     * and tells the remaining participants the roster changed.
     */
    public function leave(int $callId, int $userId): void
    {
        DB::transaction(function () use ($callId, $userId): void {
            $call = Call::query()->lockForUpdate()->find($callId);

            if (!$call || !$call->isActive()) {
                return;
            }

            CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('user_id', $userId)
                ->whereIn('status', ['invited', 'joined'])
                ->update(['status' => 'left', 'left_at' => now()]);

            $this->reconcile($call);
        });
    }

    /**
     * A participant declines their invitation.
     */
    public function reject(int $callId, int $userId): void
    {
        DB::transaction(function () use ($callId, $userId): void {
            $call = Call::query()->lockForUpdate()->find($callId);

            if (!$call || !$call->isActive()) {
                return;
            }

            CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('user_id', $userId)
                ->where('status', 'invited')
                ->update(['status' => 'rejected', 'left_at' => now()]);

            $this->reconcile($call);
        });
    }

    /**
     * Force a call closed with an explicit terminal status.
     */
    public function finish(Call $call, string $status): void
    {
        $participants = CallParticipant::query()->where('call_id', $call->id)->get();
        $allIds = $participants->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        $invitedIds = $participants->where('status', 'invited')->pluck('user_id')->map(fn ($id) => (int) $id)->all();

        $call->update(['status' => $status, 'ended_at' => now()]);

        CallParticipant::query()
            ->where('call_id', $call->id)
            ->whereIn('status', ['invited', 'joined'])
            ->update(['status' => 'left', 'left_at' => now()]);

        // Signalling rows are meaningless once the call is over.
        CallSignal::query()->where('call_id', $call->id)->delete();

        if ($status === 'missed') {
            $this->notifications->notifyMissedCall($call, $invitedIds);
        }

        event(new CallEnded($call->id, $allIds, $status));
    }

    /**
     * Remove participants whose client stopped heartbeating (closed tab,
     * crashed browser, lost network) and close calls that end up empty.
     * Also expires calls that rang for too long without an answer.
     *
     * @return array{stale_participants:int, missed_calls:int, lapsed_invitations:int}
     */
    public function expireStale(): array
    {
        $missed = 0;
        $ringingCutoff = now()->subSeconds((int) config('calls.ringing_timeout_seconds', 60));

        Call::query()
            ->where('status', 'ringing')
            ->where('created_at', '<', $ringingCutoff)
            ->pluck('id')
            ->each(function ($callId) use (&$missed): void {
                DB::transaction(function () use ($callId, &$missed): void {
                    $call = Call::query()->lockForUpdate()->find($callId);
                    if ($call && $call->status === 'ringing') {
                        $this->finish($call, 'missed');
                        $missed++;
                    }
                });
            });

        $staleCutoff = now()->subSeconds((int) config('calls.stale_participant_seconds', 60));

        $stale = CallParticipant::query()
            ->where('status', 'joined')
            ->whereHas('call', fn ($q) => $q->whereIn('status', ['ringing', 'active']))
            ->where(function ($q) use ($staleCutoff): void {
                $q->where('last_heartbeat_at', '<', $staleCutoff)
                    ->orWhere(fn ($inner) => $inner->whereNull('last_heartbeat_at')->where('joined_at', '<', $staleCutoff));
            })
            ->get(['call_id', 'user_id']);

        foreach ($stale as $participant) {
            $this->leave((int) $participant->call_id, (int) $participant->user_id);
        }

        // Someone added to a call that is already under way is rung individually.
        // The call-level timeout above only covers calls nobody has answered yet,
        // so without this an unanswered late invitation would ring forever.
        $lapsed = CallParticipant::query()
            ->where('status', 'invited')
            ->where('updated_at', '<', $ringingCutoff)
            ->whereHas('call', fn ($q) => $q->where('status', 'active'))
            ->get(['call_id', 'user_id']);

        foreach ($lapsed as $invitation) {
            $this->lapseInvitation((int) $invitation->call_id, (int) $invitation->user_id);
        }

        return [
            'stale_participants' => $stale->count(),
            'missed_calls' => $missed,
            'lapsed_invitations' => $lapsed->count(),
        ];
    }

    /**
     * An invitation to a call that is already running went unanswered.
     * Counts as a missed call for that person and stops their ringing.
     */
    public function lapseInvitation(int $callId, int $userId): void
    {
        $lapsed = false;

        DB::transaction(function () use ($callId, $userId, &$lapsed): void {
            $call = Call::query()->lockForUpdate()->find($callId);

            if (!$call || !$call->isActive()) {
                return;
            }

            $lapsed = CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('user_id', $userId)
                ->where('status', 'invited')
                ->update(['status' => 'rejected', 'left_at' => now()]) > 0;

            if ($lapsed) {
                $this->reconcile($call);
            }
        });

        if ($lapsed) {
            $call = Call::query()->find($callId);
            if ($call) {
                $this->notifications->notifyMissedCall($call, [$userId]);
            }
            event(new CallHandledElsewhere($callId, $userId));
        }
    }

    /**
     * Users in $userIds who may not take part in calls (no `call:use`).
     *
     * @param  int[]  $userIds
     * @return \Illuminate\Support\Collection<int, User>
     */
    public function usersWithoutCallAccess(array $userIds)
    {
        return User::query()
            ->whereIn('id', $userIds)
            ->get()
            ->reject(fn (User $user) => $user->can('call:use'))
            ->values();
    }

    /**
     * ICE server list for a user. TURN credentials are short-lived and derived
     * from a server-side secret (coturn "use-auth-secret" scheme).
     *
     * @return array<int, array<string, mixed>>
     */
    public function iceServers(User $user): array
    {
        $config = config('calls.ice');
        $servers = [];

        if (!empty($config['stun_urls'])) {
            $servers[] = ['urls' => $config['stun_urls']];
        }

        if (!empty($config['turn_urls']) && !empty($config['turn_secret'])) {
            $expires = time() + (int) $config['turn_ttl_seconds'];
            $username = $expires . ':' . $user->id;

            $servers[] = [
                'urls' => $config['turn_urls'],
                'username' => $username,
                'credential' => base64_encode(hash_hmac('sha1', $username, (string) $config['turn_secret'], true)),
            ];
        }

        return $servers;
    }

    /**
     * Decide what a departure/rejection means for the call. Must run inside a
     * transaction with $call locked.
     */
    private function reconcile(Call $call): void
    {
        $participants = CallParticipant::query()->where('call_id', $call->id)->get();
        $joined = $participants->where('status', 'joined');
        $invited = $participants->where('status', 'invited');
        $hostStillJoined = $joined->contains(fn ($p) => (int) $p->user_id === $call->currentHostId());

        // Nobody left to talk to: no one joined at all, or a lone participant
        // with nobody still ringing.
        if ($joined->isEmpty() || ($joined->count() === 1 && $invited->isEmpty())) {
            if ($call->status === 'active') {
                $this->finish($call, 'ended');
            } elseif ($hostStillJoined) {
                // Host is waiting but every invitee declined.
                $this->finish($call, 'declined');
            } else {
                // Host cancelled before anyone answered.
                $this->finish($call, 'missed');
            }

            return;
        }

        // Host left a call that continues: hand the role to whoever joined first.
        if (!$hostStillJoined) {
            $newHost = $joined->sortBy(fn ($p) => $p->joined_at?->getTimestamp() ?? PHP_INT_MAX)->first();
            $call->update(['host_id' => $newHost->user_id]);
        }

        $call->refresh();

        $recipientIds = $participants
            ->whereIn('status', ['invited', 'joined'])
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        event(new CallUpdated($this->format($call), $recipientIds));
    }
}
