<?php

namespace App\Http\Controllers;

use App\Events\CallAnswered;
use App\Events\CallEnded;
use App\Events\CallHandledElsewhere;
use App\Events\CallInitiated;
use App\Events\CallMediaStateChanged;
use App\Events\CallMuteRequested;
use App\Events\CallRejected;
use App\Events\CallSignalSent;
use App\Events\CallUpdated;
use App\Models\Call;
use App\Models\CallParticipant;
use App\Models\CallSignal;
use App\Models\ChatConversation;
use App\Models\User;
use App\Services\CallService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CallController extends Controller
{
    /** Largest accepted signalling payload (an SDP with many candidates is ~10-20 KB). */
    private const MAX_SIGNAL_BYTES = 60000;

    public function __construct(private readonly CallService $calls)
    {
    }

    /**
     * Client-side call configuration: ICE servers (with short-lived TURN
     * credentials), heartbeat cadence and feature switches.
     */
    public function config(Request $request)
    {
        return $this->ok([
            'ice_servers' => $this->calls->iceServers($request->user()),
            'heartbeat_interval_seconds' => (int) config('calls.heartbeat_interval_seconds', 15),
            'max_participants' => (int) config('calls.max_participants', 4),
            'video_enabled' => (bool) config('calls.video_enabled', true),
            'screen_share_enabled' => (bool) config('calls.screen_share_enabled', true),
        ]);
    }

    /**
     * Keeps last_seen_at fresh for idle tabs (the presence middleware does the
     * actual write; this endpoint just gives idle clients something to call).
     */
    public function ping()
    {
        return $this->ok(null, 'pong');
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

        $userQuery = User::query()
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
                'online' => (bool) ($u->last_seen_at && $u->last_seen_at->gt($threshold)),
                'in_call' => isset($inCallUserIds[$u->id]),
            ],
        ]);

        return $this->ok($statuses);
    }

    /**
     * The caller's own ringing/active call, if any. Lets a client that just
     * loaded or reconnected its websocket recover an incoming ring or resync
     * state it missed while offline.
     */
    public function current(Request $request)
    {
        $user = $request->user();

        $query = Call::query()
            ->whereIn('status', ['ringing', 'active'])
            ->whereHas('callParticipants', fn ($q) => $q
                ->where('user_id', $user->id)
                ->whereIn('status', ['invited', 'joined']))
            ->latest('id');
        $this->scopeToCompany($request, $query);
        $call = $query->first();

        return $this->ok($call ? $this->calls->format($call) : null);
    }

    /**
     * Initiate a new call. Body: { conversation_id?, participant_ids[], type: audio|video }
     */
    public function initiate(Request $request)
    {
        $user = $request->user();
        $maxInvitees = max(1, (int) config('calls.max_participants', 4) - 1);

        $validated = $request->validate([
            'conversation_id' => 'nullable|integer|exists:chat_conversations,id',
            'participant_ids' => "required|array|min:1|max:{$maxInvitees}",
            'participant_ids.*' => 'integer|exists:users,id|not_in:' . $user->id,
            'type' => 'required|in:audio,video',
        ]);

        if (!$user->can('call:use')) {
            return $this->fail('You do not have permission to make calls.', 403);
        }

        if ($validated['type'] === 'video' && !config('calls.video_enabled', true)) {
            return $this->fail('Video calls are disabled.', 403);
        }

        if (!$user->company_id) {
            return $this->fail('Your account is not associated with a company.', 403);
        }

        $participantIds = array_values(array_unique(array_map('intval', $validated['participant_ids'])));

        // Everyone must belong to the caller's company.
        $sameCompany = User::query()
            ->whereIn('id', $participantIds)
            ->where('company_id', $user->company_id)
            ->count();

        if ($sameCompany !== count($participantIds)) {
            return $this->fail('You cannot call users outside your company.', 403);
        }

        // Ringing someone who is not allowed to answer would just time out.
        $blocked = $this->calls->usersWithoutCallAccess($participantIds);
        if ($blocked->isNotEmpty()) {
            return $this->fail(
                $blocked->count() === 1
                    ? "{$blocked->first()->name} is not able to receive calls."
                    : 'Some of the selected people are not able to receive calls.',
                422
            );
        }

        // A linked conversation must include the caller and every invitee.
        if (!empty($validated['conversation_id'])) {
            $conversation = ChatConversation::query()->with('participants:id')->find($validated['conversation_id']);
            $memberIds = $conversation?->participants->pluck('id')->map(fn ($id) => (int) $id)->all() ?? [];

            if (!in_array((int) $user->id, $memberIds, true)) {
                return $this->fail('You are not a member of this conversation.', 403);
            }

            if (array_diff($participantIds, $memberIds) !== []) {
                return $this->fail('All participants must be members of the conversation.', 422);
            }
        }

        $isGroup = count($participantIds) > 1;

        // "Busy" is derived from call rows, so clear out dead ones first. This keeps
        // people from being stuck "on a call" if the scheduler is late or not running.
        $this->calls->expireStale();

        $result = DB::transaction(function () use ($validated, $participantIds, $user, $isGroup) {
            // Re-check busy state inside the transaction so two simultaneous
            // requests cannot both slip through.
            if ($this->calls->busyUserIds([(int) $user->id]) !== []) {
                return ['error' => ['You already have an active call in progress.', 422]];
            }

            $busyIds = $this->calls->busyUserIds($participantIds);

            if (!$isGroup && $busyIds !== []) {
                return ['error' => ['This user is currently on another call.', 422]];
            }

            if ($isGroup && count($busyIds) === count($participantIds)) {
                return ['error' => ['All selected participants are currently on another call.', 422]];
            }

            $call = Call::create([
                'conversation_id' => $validated['conversation_id'] ?? null,
                'initiated_by' => $user->id,
                'host_id' => $user->id,
                'type' => $validated['type'],
                'call_type' => $isGroup ? 'group' : 'direct',
                'status' => 'ringing',
                'company_id' => $user->company_id,
            ]);

            CallParticipant::create([
                'call_id' => $call->id,
                'user_id' => $user->id,
                'status' => 'joined',
                'joined_at' => now(),
                'last_heartbeat_at' => now(),
            ]);

            // Busy participants are auto-declined so they are never rung.
            foreach ($participantIds as $participantId) {
                $busy = in_array($participantId, $busyIds, true);

                CallParticipant::create([
                    'call_id' => $call->id,
                    'user_id' => $participantId,
                    'status' => $busy ? 'rejected' : 'invited',
                    'left_at' => $busy ? now() : null,
                ]);
            }

            return ['call' => $call];
        });

        if (isset($result['error'])) {
            return $this->fail($result['error'][0], $result['error'][1]);
        }

        $call = $result['call'];
        $formatted = $this->calls->format($call->load(['initiator:id,name,email', 'callParticipants.user:id,name,email']));

        $invitedIds = $call->callParticipants
            ->where('status', 'invited')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        event(new CallInitiated($formatted, $invitedIds));

        return $this->ok($formatted, 'Call initiated', 201);
    }

    /**
     * Get call details.
     */
    public function show(Request $request, int $id)
    {
        $user = $request->user();

        $showQuery = Call::query()
            ->whereHas('callParticipants', fn ($q) => $q->where('user_id', $user->id));
        $this->scopeToCompany($request, $showQuery);
        $call = $showQuery->findOrFail($id);

        return $this->ok($this->calls->format($call));
    }

    /**
     * Answer an incoming call.
     */
    public function answer(Request $request, int $id)
    {
        $user = $request->user();

        if (!$user->can('call:use')) {
            return $this->fail('You do not have permission to answer calls.', 403);
        }

        $call = DB::transaction(function () use ($request, $id, $user) {
            // 'active' is included so a participant added mid-call can still answer.
            $query = Call::query()->whereIn('status', ['ringing', 'active'])->lockForUpdate();
            $this->scopeToCompany($request, $query);
            $call = $query->findOrFail($id);

            $participant = CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('user_id', $user->id)
                ->where('status', 'invited')
                ->firstOrFail();

            $participant->update([
                'status' => 'joined',
                'joined_at' => now(),
                'last_heartbeat_at' => now(),
            ]);

            if ($call->status === 'ringing') {
                $call->update(['status' => 'active', 'started_at' => now()]);
            }

            return $call;
        });

        $call = $call->fresh();
        $formatted = $this->calls->format($call);

        // Every other current participant (joined or still ringing) learns of
        // the new joiner so group calls build a complete peer mesh.
        $otherIds = $call->callParticipants
            ->whereIn('status', ['invited', 'joined'])
            ->where('user_id', '!=', $user->id)
            ->pluck('user_id')
            ->map(fn ($uid) => (int) $uid)
            ->all();

        event(new CallAnswered($formatted, $otherIds));
        // Stop ringing on this user's other tabs/devices.
        event(new CallHandledElsewhere($call->id, $user->id));

        return $this->ok($formatted, 'Call answered');
    }

    /**
     * Decline an incoming call.
     */
    public function reject(Request $request, int $id)
    {
        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->where('status', 'invited')
            ->firstOrFail();

        $this->calls->reject($call->id, $user->id);

        // Tell the host who declined (useful in group calls that continue).
        event(new CallRejected($call->id, $user->id, $call->currentHostId()));
        event(new CallHandledElsewhere($call->id, $user->id));

        return $this->ok(null, 'Call rejected');
    }

    /**
     * Leave / end a call. Direct calls end for both sides; group calls
     * continue while two or more people remain, handing off the host role.
     */
    public function end(Request $request, int $id)
    {
        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        $isParticipant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->exists();

        if (!$isParticipant) {
            return $this->fail('You are not a participant in this call.', 403);
        }

        $this->calls->leave($call->id, $user->id);

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
        $newUserId = (int) $validated['user_id'];

        $result = DB::transaction(function () use ($request, $id, $user, $newUserId) {
            $query = Call::query()->whereIn('status', ['ringing', 'active'])->lockForUpdate();
            $this->scopeToCompany($request, $query);
            $call = $query->findOrFail($id);

            if (!$call->isHost($user->id)) {
                return ['error' => ['Only the call host can add participants.', 403]];
            }

            if ($newUserId === (int) $user->id) {
                return ['error' => ['You are already in this call.', 422]];
            }

            $target = User::query()->where('id', $newUserId)->where('company_id', $user->company_id)->first();
            if (!$target) {
                return ['error' => ['You cannot add users outside your company.', 403]];
            }

            $existing = CallParticipant::query()
                ->where('call_id', $call->id)
                ->where('user_id', $newUserId)
                ->first();

            if ($existing && in_array($existing->status, ['invited', 'joined'], true)) {
                return ['error' => ['User is already in this call.', 422]];
            }

            $occupied = CallParticipant::query()
                ->where('call_id', $call->id)
                ->whereIn('status', ['invited', 'joined'])
                ->count();

            if ($occupied >= (int) config('calls.max_participants', 4)) {
                return ['error' => ['This call has reached its participant limit.', 422]];
            }

            if ($this->calls->busyUserIds([$newUserId]) !== []) {
                return ['error' => ['This user is currently on another call.', 422]];
            }

            if ($this->calls->usersWithoutCallAccess([$newUserId])->isNotEmpty()) {
                return ['error' => ['This user is not able to receive calls.', 422]];
            }

            if ($existing) {
                $existing->update(['status' => 'invited', 'joined_at' => null, 'left_at' => null, 'last_heartbeat_at' => null]);
            } else {
                CallParticipant::create(['call_id' => $call->id, 'user_id' => $newUserId, 'status' => 'invited']);
            }

            if ($call->call_type !== 'group') {
                $call->update(['call_type' => 'group']);
            }

            return ['call' => $call];
        });

        if (isset($result['error'])) {
            return $this->fail($result['error'][0], $result['error'][1]);
        }

        $call = $result['call']->fresh();
        $formatted = $this->calls->format($call);

        // Ring the newly invited participant, and refresh everyone else.
        event(new CallInitiated($formatted, [$newUserId]));
        event(new CallUpdated($formatted, $this->activeParticipantIds($call, [$newUserId])));

        return $this->ok($formatted, 'Participant added');
    }

    /**
     * Remove a participant from an active call. Host-only.
     */
    public function removeParticipant(Request $request, int $id, int $userId)
    {
        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        if (!$call->isHost($user->id)) {
            return $this->fail('Only the call host can remove participants.', 403);
        }

        if ($userId === (int) $user->id) {
            return $this->fail('Use "end call" to leave yourself.', 422);
        }

        CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $userId)
            ->whereIn('status', ['invited', 'joined'])
            ->firstOrFail();

        $this->calls->leave($call->id, $userId);

        // Close the removed participant's call window.
        event(new CallEnded($call->id, [$userId], 'removed'));

        return $this->ok($this->calls->format($call->fresh()), 'Participant removed');
    }

    /**
     * Ask a participant's client to mute their own microphone. Host-only.
     * This is a soft request: in a peer-to-peer mesh there is no server-side
     * media path to force-mute from, so the target's client honours it locally.
     */
    public function muteParticipant(Request $request, int $id, int $userId)
    {
        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        if (!$call->isHost($user->id)) {
            return $this->fail('Only the call host can mute participants.', 403);
        }

        $isJoined = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $userId)
            ->where('status', 'joined')
            ->exists();

        if (!$isJoined) {
            return $this->fail('That user is not currently in this call.', 404);
        }

        event(new CallMuteRequested($call->id, $userId));

        return $this->ok(null, 'Mute request sent');
    }

    /**
     * Liveness ping from a joined participant. The response tells the client
     * whether its call is still valid, so a client that was removed or timed
     * out while offline closes its window instead of lingering.
     */
    public function heartbeat(Request $request, int $id)
    {
        $user = $request->user();

        $query = Call::query();
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        $participant = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($call->isActive() && $participant->status === 'joined') {
            $participant->update(['last_heartbeat_at' => now()]);
        }

        return $this->ok([
            'call_status' => $call->status,
            'participant_status' => $participant->status,
            'host_id' => $call->currentHostId(),
        ]);
    }

    /**
     * Broadcast this participant's mic / camera / screen-share state to the
     * other joined participants so their UI shows real state, not guesses.
     */
    public function mediaState(Request $request, int $id)
    {
        $validated = $request->validate([
            'muted' => 'required|boolean',
            'camera_off' => 'required|boolean',
            'screen_sharing' => 'required|boolean',
        ]);

        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        $isJoined = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('user_id', $user->id)
            ->where('status', 'joined')
            ->exists();

        if (!$isJoined) {
            return $this->fail('You are not currently in this call.', 403);
        }

        if (!empty($validated['screen_sharing']) && !config('calls.screen_share_enabled', true)) {
            return $this->fail('Screen sharing is disabled.', 403);
        }

        $recipients = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('status', 'joined')
            ->where('user_id', '!=', $user->id)
            ->pluck('user_id')
            ->map(fn ($uid) => (int) $uid)
            ->all();

        if ($recipients !== []) {
            event(new CallMediaStateChanged($call->id, $user->id, $validated, $recipients));
        }

        return $this->ok(null, 'State broadcast');
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
            'payload.type' => 'required_if:type,offer,answer|nullable|in:offer,answer',
            'payload.sdp' => 'required_if:type,offer,answer|nullable|string',
            'payload.candidate' => 'present_if:type,ice-candidate|nullable|string',
        ]);

        $payload = (array) $request->input('payload');

        if (strlen((string) json_encode($payload)) > self::MAX_SIGNAL_BYTES) {
            return $this->fail('Signal payload too large.', 422);
        }

        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        // Both ends must currently be in the call.
        $joinedCount = CallParticipant::query()
            ->where('call_id', $call->id)
            ->where('status', 'joined')
            ->whereIn('user_id', [$user->id, $validated['to_user_id']])
            ->count();

        if ((int) $validated['to_user_id'] === (int) $user->id || $joinedCount !== 2) {
            return $this->fail('Invalid signal target.', 403);
        }

        $signal = CallSignal::create([
            'call_id' => $call->id,
            'from_user_id' => $user->id,
            'to_user_id' => $validated['to_user_id'],
            'type' => $validated['type'],
            'payload' => $payload,
            'is_consumed' => false,
        ]);

        event(new CallSignalSent($signal));

        return $this->ok(['id' => $signal->id], 'Signal sent', 201);
    }

    /**
     * Fetch pending WebRTC signals addressed to the authenticated user for a
     * call (polling fallback if the websocket is unavailable). Marks them as
     * consumed so they are not returned again.
     */
    public function getSignals(Request $request, int $id)
    {
        $user = $request->user();

        $query = Call::query()->whereIn('status', ['ringing', 'active']);
        $this->scopeToCompany($request, $query);
        $call = $query->findOrFail($id);

        $signals = CallSignal::query()
            ->where('call_id', $call->id)
            ->where('to_user_id', $user->id)
            ->where('is_consumed', false)
            ->orderBy('id')
            ->get();

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
            'status' => 'nullable|in:all,ended,missed,declined',
            'type' => 'nullable|in:all,audio,video',
            'page' => 'nullable|integer|min:1',
        ]);

        $user = $request->user();
        $status = $validated['status'] ?? 'all';
        $type = $validated['type'] ?? 'all';

        $query = Call::query()
            ->whereHas('callParticipants', fn ($q) => $q->where('user_id', $user->id))
            ->whereIn('status', $status === 'all' ? ['ended', 'missed', 'declined'] : [$status])
            ->with(['initiator:id,name,email', 'callParticipants.user:id,name,email'])
            ->latest('id');

        if ($type !== 'all') {
            $query->where('type', $type);
        }

        $this->scopeToCompany($request, $query);
        $paginated = $query->paginate(50, ['*'], 'page', $validated['page'] ?? 1);

        return $this->ok([
            'data' => collect($paginated->items())->map(fn ($call) => $this->calls->format($call)),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'total' => $paginated->total(),
        ]);
    }

    /**
     * Ids of participants who are still invited or joined, excluding $except.
     *
     * @param  int[]  $except
     * @return int[]
     */
    private function activeParticipantIds(Call $call, array $except = []): array
    {
        return $call->callParticipants()
            ->whereIn('status', ['invited', 'joined'])
            ->whereNotIn('user_id', $except)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
