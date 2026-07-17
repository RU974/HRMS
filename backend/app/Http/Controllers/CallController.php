<?php

namespace App\Http\Controllers;

use App\Events\CallAnswered;
use App\Events\CallEnded;
use App\Events\CallInitiated;
use App\Events\CallMuteRequested;
use App\Events\CallRejected;
use App\Events\CallSignalSent;
use App\Models\Call;
use App\Models\CallParticipant;
use App\Models\CallSignal;
use App\Models\ChatConversation;
use App\Models\User;
use App\Services\CallNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CallController extends Controller
{
    public function __construct(private readonly CallNotificationService $callNotifications)
    {
    }

    /**
     * Update the authenticated user's last_seen_at timestamp.
     */
    public function heartbeat(Request $request)
    {
        $request->user()->update(['last_seen_at' => now()]);
        return $this->ok(null);
    }

    /**
     * Return online status for a list of user IDs within the same company.
     */
    public function onlineStatus(Request $request)
    {
        $validated = $request->validate([
            'user_ids' => 'required|array|max:50',
            'user_ids.*' => 'integer',
        ]);

        $threshold = now()->subMinutes(2);
        $user = $request->user();

        $userQuery = \App\Models\User::query()
            ->whereIn('id', $validated['user_ids'])
            ->select(['id', 'last_seen_at']);
        $this->scopeToCompany($request, $userQuery);
        $users = $userQuery->get();

        $inCallUserIds = CallParticipant::query()
            ->whereIn('user_id', $users->pluck('id'))
            ->where('status', 'joined')
            ->whereHas('call', fn ($q) => $q->where('status', 'active'))
            ->pluck('user_id')
            ->flip()
            ->toArray();

        $statuses = $users->mapWithKeys(fn ($u) => [
            $u->id => [
                'online'   => $u->last_seen_at && $u->last_seen_at->gt($threshold),
                'in_call'  => isset($inCallUserIds[$u->id]),
            ],
        ]);

        return $this->ok($statuses);
    }

    /**
     * Initiate a new call. Body: { conversation_id?, participant_ids[], type: audio|video }
     */
    public function initiate(Request $request)
    {
        $validated = $request->validate([
            'conversation_id' => 'nullable|integer|exists:chat_conversations,id',
            'participant_ids' => 'required|array|min:1|max:19',
            'participant_ids.*' => 'integer|exists:users,id|different:' . $request->user()->id,
            'type' => 'required|in:audio,video',
        ]);

        $user = $request->user();
        $participantIds = array_unique($validated['participant_ids']);

        // Ensure all participants are in the same company
        $outsiders = User::query()
            ->whereIn('id', $participantIds)
            ->where('company_id', '!=', $user->company_id)
            ->exists();

        if ($outsiders) {
            return $this->fail('You cannot call users outside your company.', 403);
        }

        // Check if user already has an active call
        $activeCallQuery = Call::query()
            ->where('status', 'ringing')
            ->whereHas('callParticipants', fn ($q) => $q->where('user_id', $user->id)->whereIn('status', ['invited', 'joined']));
        $this->scopeToCompany($request, $activeCallQuery);
        $activeCall = $activeCallQuery->first();

        if ($activeCall) {
            return $this->fail('You already have an active call in progress.', 422);
        }

        // Call waiting: don't ring participants who are already on another call.
        $busyIds = $this->busyParticipantIds($participantIds);
        $isGroup = count($participantIds) > 1;

        if (!$isGroup && !empty($busyIds)) {
            return $this->fail('This user is currently on another call.', 422);
        }

        if ($isGroup && count($busyIds) === count($participantIds)) {
            return $this->fail('All selected participants are currently on another call.', 422);
        }

        $call = DB::transaction(function () use ($validated, $participantIds, $busyIds, $user, $isGroup) {
            $call = Call::create([
                'conversation_id' => $validated['conversation_id'] ?? null,
                'initiated_by' => $user->id,
                'type' => $validated['type'],
                'call_type' => $isGroup ? 'group' : 'direct',
                'status' => 'ringing',
                'company_id' => $user->company_id,
            ]);

            // Add caller as joined participant
            CallParticipant::create([
                'call_id' => $call->id,
                'user_id' => $user->id,
                'status' => 'joined',
                'joined_at' => now(),
            ]);

            // Add other participants as invited — busy ones are auto-declined
            // immediately so they're never rung, and the caller sees they were skipped.
            foreach ($participantIds as $participantId) {
                CallParticipant::create([
                    'call_id' => $call->id,
                    'user_id' => $participantId,
                    'status' => in_array($participantId, $busyIds, true) ? 'rejected' : 'invited',
                    'left_at' => in_array($participantId, $busyIds, true) ? now() : null,
                ]);
            }

            return $call;
        });

        $formatted = $this->formatCall($call->load(['initiator:id,name,email', 'callParticipants.user:id,name,email']));

        // Notify only the participants who were actually invited (not the busy ones).
        $invitedIds = $call->callParticipants
            ->where('user_id', '!=', $user->id)
            ->where('status', 'invited')
            ->pluck('user_id')
            ->toArray();

        event(new CallInitiated($formatted, $invitedIds));

        return $this->ok($formatted, 'Call initiated', 201);
    }

    /**
     * Poll for incoming calls for the authenticated user.
     */
    public function incoming(Request $request)
    {
        $user = $request->user();

        $incomingQuery = Call::query()
            ->where('status', 'ringing')
            ->whereHas('callParticipants', fn ($q) => $q->where('user_id', $user->id)->where('status', 'invited'))
            ->with(['initiator:id,name,email', 'callParticipants.user:id,name,email']);
        $this->scopeToCompany($request, $incomingQuery);
        $calls = $incomingQuery->get()->map(fn ($call) => $this->formatCall($call));

        return $this->ok($calls);
    }

    /**
     * Get call details.
     */
    public function show(Request $request, int $id)
    {
        $user = $request->user();

        $showQuery = Call::query()
            ->whereHas('callParticipants', fn ($q) => $q->where('user_id', $user->id))
            ->with(['initiator:id,name,email', 'callParticipants.user:id,name,email']);
        $this->scopeToCompany($request, $showQuery);
        $call = $showQuery->findOrFail($id);

        return $this->ok($this->formatCall($call));
    }

    /**
     * Answer an incoming call.
     */
    public function answer(Request $request, int $id)
    {
        $user = $request->user();

        // 'active' is included so a participant added mid-call (via addParticipant)
        // can still answer after the call has already gone active.
        $answerQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $answerQuery);
        $call = $answerQuery->findOrFail($id);

        $participant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->where('status', 'invited')
            ->firstOrFail();

        DB::transaction(function () use ($call, $participant) {
            $participant->update([
                'status' => 'joined',
                'joined_at' => now(),
            ]);

            // Mark call as active once at least one non-initiator joins
            if ($call->status === 'ringing') {
                $call->update(['status' => 'active', 'started_at' => now()]);
            }
        });

        $call = $call->fresh()->load(['initiator:id,name,email', 'callParticipants.user:id,name,email']);
        $formatted = $this->formatCall($call);

        // Notify every other current participant (joined or still invited) so
        // group calls build a complete peer mesh, not just the initiator.
        $otherParticipantIds = $call->callParticipants
            ->where('user_id', '!=', $user->id)
            ->pluck('user_id')
            ->toArray();

        event(new CallAnswered($formatted, $otherParticipantIds));

        return $this->ok($formatted, 'Call answered');
    }

    /**
     * Reject an incoming call.
     */
    public function reject(Request $request, int $id)
    {
        $user = $request->user();

        $rejectQuery = Call::query();
        $this->scopeToCompany($request, $rejectQuery);
        $call = $rejectQuery->findOrFail($id);

        $participant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->whereIn('status', ['invited', 'joined'])
            ->firstOrFail();

        $participant->update(['status' => 'rejected', 'left_at' => now()]);

        // Notify the initiator that this participant declined (useful in group calls).
        if ($call->initiated_by !== $user->id) {
            event(new CallRejected($call->id, $user->id, $call->initiated_by));
        }

        // If caller rejects their own call or all participants rejected, end the call
        $activeCount = CallParticipant::query()
            ->where('call_id', $call->id)
            ->whereIn('status', ['invited', 'joined'])
            ->count();

        if ($activeCount === 0 || $call->initiated_by === $user->id) {
            $wasRinging = $call->status === 'ringing';

            $call->update([
                'status' => $wasRinging ? 'missed' : 'ended',
                'ended_at' => now(),
            ]);

            $allParticipantIds = CallParticipant::query()
                ->where('call_id', $call->id)
                ->pluck('user_id')
                ->toArray();

            if ($wasRinging) {
                $missedUserIds = array_values(array_diff($allParticipantIds, [$call->initiated_by]));
                $this->callNotifications->notifyMissedCall($call, $missedUserIds);
            }

            event(new CallEnded($call->id, $allParticipantIds));
        }

        return $this->ok(null, 'Call rejected');
    }

    /**
     * End an active call. Any joined participant can end the call for everyone.
     */
    public function end(Request $request, int $id)
    {
        $user = $request->user();

        $endQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $endQuery);
        $call = $endQuery->findOrFail($id);

        // Verify user is a participant
        $isParticipant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->exists();

        if (!$isParticipant) {
            return $this->fail('You are not a participant in this call.', 403);
        }

        $callEnded = false;

        DB::transaction(function () use ($call, $user, &$callEnded) {
            // Mark current user as left
            CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('user_id', $user->id)
                ->whereIn('status', ['joined', 'invited'])
                ->update(['status' => 'left', 'left_at' => now()]);

            // For direct calls or when caller ends — end for everyone
            $joinedCount = CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('status', 'joined')
                ->count();

            if ($joinedCount === 0 || $call->initiated_by === $user->id || $call->call_type === 'direct') {
                $call->update([
                    'status' => 'ended',
                    'ended_at' => now(),
                ]);

                // Mark remaining participants as left
                CallParticipant::query()
                    ->where('call_id', $call->id)
                    ->whereIn('status', ['joined', 'invited'])
                    ->update(['status' => 'left', 'left_at' => now()]);

                $callEnded = true;
            }
        });

        if ($callEnded) {
            $allParticipantIds = CallParticipant::query()
                ->where('call_id', $call->id)
                ->pluck('user_id')
                ->toArray();

            event(new CallEnded($call->id, $allParticipantIds));
        }

        return $this->ok(null, 'Call ended');
    }

    /**
     * Add a participant to an active/ringing call. Host-only.
     */
    public function addParticipant(Request $request, int $id)
    {
        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $user = $request->user();

        $callQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $callQuery);
        $call = $callQuery->findOrFail($id);

        if ($call->initiated_by !== $user->id) {
            return $this->fail('Only the call host can add participants.', 403);
        }

        $newUserId = (int) $validated['user_id'];

        if ($newUserId === $user->id) {
            return $this->fail('You are already in this call.', 422);
        }

        $target = User::query()->where('id', $newUserId)->where('company_id', $user->company_id)->first();
        if (!$target) {
            return $this->fail('You cannot add users outside your company.', 403);
        }

        $existing = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $newUserId)
            ->first();

        if ($existing && in_array($existing->status, ['invited', 'joined'], true)) {
            return $this->fail('User is already in this call.', 422);
        }

        if (!empty($this->busyParticipantIds([$newUserId]))) {
            return $this->fail('This user is currently on another call.', 422);
        }

        DB::transaction(function () use ($call, $existing, $newUserId) {
            if ($existing) {
                $existing->update(['status' => 'invited', 'joined_at' => null, 'left_at' => null]);
            } else {
                CallParticipant::create(['call_id' => $call->id, 'user_id' => $newUserId, 'status' => 'invited']);
            }

            if ($call->call_type !== 'group') {
                $call->update(['call_type' => 'group']);
            }
        });

        $call = $call->fresh()->load(['initiator:id,name,email', 'callParticipants.user:id,name,email']);
        $formatted = $this->formatCall($call);

        // Ring the newly invited participant.
        event(new CallInitiated($formatted, [$newUserId]));

        // Let every existing participant know the roster changed.
        $existingParticipantIds = $call->callParticipants
            ->where('user_id', '!=', $newUserId)
            ->pluck('user_id')
            ->toArray();
        event(new CallAnswered($formatted, $existingParticipantIds));

        return $this->ok($formatted, 'Participant added');
    }

    /**
     * Remove a participant from an active call. Host-only.
     */
    public function removeParticipant(Request $request, int $id, int $userId)
    {
        $user = $request->user();

        $callQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $callQuery);
        $call = $callQuery->findOrFail($id);

        if ($call->initiated_by !== $user->id) {
            return $this->fail('Only the call host can remove participants.', 403);
        }

        if ($userId === $user->id) {
            return $this->fail('Use "end call" to leave yourself.', 422);
        }

        $participant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $userId)
            ->whereIn('status', ['invited', 'joined'])
            ->firstOrFail();

        $participant->update(['status' => 'left', 'left_at' => now()]);

        $call = $call->fresh()->load(['initiator:id,name,email', 'callParticipants.user:id,name,email']);
        $formatted = $this->formatCall($call);

        // Close the removed participant's call window.
        event(new CallEnded($call->id, [$userId]));

        // Let everyone else know the roster changed.
        $remainingParticipantIds = $call->callParticipants
            ->where('user_id', '!=', $userId)
            ->pluck('user_id')
            ->toArray();
        event(new CallAnswered($formatted, $remainingParticipantIds));

        return $this->ok($formatted, 'Participant removed');
    }

    /**
     * Ask a participant's client to mute their own microphone. Host-only.
     * This is a soft request — the target's client honors it locally, since a
     * mesh call has no server-side media path to force-mute from.
     */
    public function muteParticipant(Request $request, int $id, int $userId)
    {
        $user = $request->user();

        $callQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $callQuery);
        $call = $callQuery->findOrFail($id);

        if ($call->initiated_by !== $user->id) {
            return $this->fail('Only the call host can mute participants.', 403);
        }

        $isParticipant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $userId)
            ->where('status', 'joined')
            ->exists();

        if (!$isParticipant) {
            return $this->fail('That user is not currently in this call.', 404);
        }

        event(new CallMuteRequested($call->id, $userId));

        return $this->ok(null, 'Mute request sent');
    }

    /**
     * Send a WebRTC signal (offer / answer / ice-candidate).
     */
    public function sendSignal(Request $request, int $id)
    {
        $validated = $request->validate([
            'to_user_id' => 'required|integer|exists:users,id',
            'type' => 'required|in:offer,answer,ice-candidate',
            'payload' => 'required|array',
        ]);

        $user = $request->user();

        $signalQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $signalQuery);
        $call = $signalQuery->findOrFail($id);

        // Verify both users are participants
        $fromIsParticipant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->exists();

        $toIsParticipant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $validated['to_user_id'])
            ->exists();

        if (!$fromIsParticipant || !$toIsParticipant) {
            return $this->fail('Invalid signal target.', 403);
        }

        $signal = CallSignal::create([
            'call_id' => $call->id,
            'from_user_id' => $user->id,
            'to_user_id' => $validated['to_user_id'],
            'type' => $validated['type'],
            'payload' => $validated['payload'],
            'is_consumed' => false,
        ]);

        // Push signal directly to recipient via WebSocket — eliminates 1.5s polling.
        event(new CallSignalSent($signal));

        return $this->ok(['id' => $signal->id], 'Signal sent', 201);
    }

    /**
     * Fetch pending WebRTC signals addressed to the authenticated user for a call.
     * Marks them as consumed so they are not returned again.
     */
    public function getSignals(Request $request, int $id)
    {
        $user = $request->user();

        $getSignalQuery = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $getSignalQuery);
        $call = $getSignalQuery->findOrFail($id);

        $signals = CallSignal::query()
            ->where('call_id', $call->id)
            ->where('to_user_id', $user->id)
            ->where('is_consumed', false)
            ->orderBy('id')
            ->get();

        // Mark as consumed
        if ($signals->isNotEmpty()) {
            CallSignal::query()
                ->whereIn('id', $signals->pluck('id'))
                ->update(['is_consumed' => true]);
        }

        return $this->ok($signals->map(fn ($s) => [
            'id' => $s->id,
            'from_user_id' => $s->from_user_id,
            'type' => $s->type,
            'payload' => $s->payload,
        ]));
    }

    /**
     * Get call history for the authenticated user.
     */
    public function history(Request $request)
    {
        $validated = $request->validate([
            'status' => 'nullable|in:all,ended,missed',
            'type' => 'nullable|in:all,audio,video',
            'page' => 'nullable|integer|min:1',
        ]);

        $user = $request->user();
        $status = $validated['status'] ?? 'all';
        $type = $validated['type'] ?? 'all';

        $historyQuery = Call::query()
            ->whereHas('callParticipants', fn ($q) => $q->where('user_id', $user->id))
            ->whereIn('status', $status === 'all' ? ['ended', 'missed'] : [$status])
            ->with(['initiator:id,name,email', 'callParticipants.user:id,name,email'])
            ->latest();

        if ($type !== 'all') {
            $historyQuery->where('type', $type);
        }

        $this->scopeToCompany($request, $historyQuery);
        $paginated = $historyQuery->paginate(50, ['*'], 'page', $validated['page'] ?? 1);

        return $this->ok([
            'data' => collect($paginated->items())->map(fn ($call) => $this->formatCall($call)),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'total' => $paginated->total(),
        ]);
    }

    /**
     * Return the subset of $userIds who are currently joined/invited on
     * another ringing or active call — used to implement call waiting.
     */
    private function busyParticipantIds(array $userIds): array
    {
        return CallParticipant::query()
            ->whereIn('user_id', $userIds)
            ->whereIn('status', ['invited', 'joined'])
            ->whereHas('call', fn ($q) => $q->whereIn('status', ['ringing', 'active']))
            ->pluck('user_id')
            ->unique()
            ->values()
            ->toArray();
    }

    private function formatCall(Call $call): array
    {
        return [
            'id' => $call->id,
            'conversation_id' => $call->conversation_id,
            'initiated_by' => $call->initiated_by,
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
            ]),
            'started_at' => $call->started_at,
            'ended_at' => $call->ended_at,
            'duration' => $call->duration(),
            'created_at' => $call->created_at,
        ];
    }
}
