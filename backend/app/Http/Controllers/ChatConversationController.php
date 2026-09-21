<?php

namespace App\Http\Controllers;

use App\Events\ChatConversationChanged;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatConversationController extends Controller
{
    /** Upper bound on group size (excluding nothing: creator included). */
    private const MAX_GROUP_MEMBERS = 50;

    public function index(Request $request)
    {
        $this->authorize('viewAny', ChatConversation::class);

        $user = $request->user();

        $conversations = ChatConversation::query()
            ->whereHas('participants', function ($query) use ($user): void {
                $query->where('user_id', $user->id);
            })
            ->with([
                'participants' => function ($query): void {
                    $query->select('users.id', 'users.name', 'users.email')->withPivot('last_read_at');
                },
                'messages' => function ($query): void {
                    $query->latest()->limit(1)->with('sender:id,name,email');
                },
            ])
            ->get();

        $unreadCounts = collect();

        if ($conversations->isNotEmpty()) {
            $unreadCounts = ChatMessage::query()
                ->whereIn('conversation_id', $conversations->pluck('id'))
                ->where('sender_id', '!=', $user->id)
                ->where(function ($builder) use ($conversations, $user): void {
                    foreach ($conversations as $conversation) {
                        $myPivot = $conversation->participants->firstWhere('id', $user->id);
                        $lastReadAt = $myPivot?->pivot?->last_read_at;

                        $builder->orWhere(function ($q) use ($conversation, $lastReadAt): void {
                            $q->where('conversation_id', $conversation->id)
                                ->when($lastReadAt, fn ($inner) => $inner->where('created_at', '>', $lastReadAt));
                        });
                    }
                })
                ->selectRaw('conversation_id, count(*) as total')
                ->groupBy('conversation_id')
                ->pluck('total', 'conversation_id');
        }

        $conversations = $conversations
            ->map(function (ChatConversation $conversation) use ($unreadCounts, $user) {
                return $this->present($conversation, $user, (int) ($unreadCounts[$conversation->id] ?? 0));
            })
            ->sortByDesc(fn ($conversation) => $conversation['last_message']?->created_at ?? $conversation['created_at'])
            ->values();

        return $this->ok($conversations);
    }

    public function store(Request $request)
    {
        $this->authorize('create', ChatConversation::class);

        $validated = $request->validate([
            'type' => 'required|in:direct,group',
            'name' => 'required_if:type,group|nullable|string|max:255',
            'participant_ids' => 'required|array|min:1|max:' . (self::MAX_GROUP_MEMBERS - 1),
            'participant_ids.*' => 'integer|exists:users,id',
        ]);

        $user = $request->user();
        $participantIds = array_values(array_unique(array_map('intval', array_merge([$user->id], $validated['participant_ids']))));

        if ($validated['type'] === 'group' && trim((string) ($validated['name'] ?? '')) === '') {
            abort(422, 'Please provide a group name.');
        }

        foreach ($participantIds as $participantId) {
            $this->assertSameCompanyUser($request, $participantId);
        }

        if ($validated['type'] === 'direct') {
            if (count($participantIds) !== 2) {
                abort(422, 'A direct conversation requires exactly one other participant.');
            }

            $existing = ChatConversation::query()
                ->where('type', 'direct')
                ->whereHas('participants', fn ($q) => $q->where('user_id', $participantIds[0]))
                ->whereHas('participants', fn ($q) => $q->where('user_id', $participantIds[1]))
                ->whereDoesntHave('participants', fn ($q) => $q->whereNotIn('user_id', $participantIds))
                ->first();

            if ($existing) {
                return $this->ok($existing->load('participants:id,name,email'), 'Conversation already exists', 200);
            }
        }

        $conversation = DB::transaction(function () use ($validated, $participantIds, $user) {
            $conversation = ChatConversation::create([
                'type' => $validated['type'],
                'name' => $validated['type'] === 'group' ? trim((string) $validated['name']) : null,
                'company_id' => $user->company_id,
                'created_by' => $user->id,
            ]);

            $conversation->participants()->attach($participantIds);

            return $conversation;
        });

        $others = array_values(array_diff($participantIds, [(int) $user->id]));
        ChatConversationChanged::dispatch($conversation->id, 'created', $others);

        return $this->ok($conversation->load('participants:id,name,email'), 'Conversation created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $conversation = ChatConversation::with([
            'participants' => function ($query): void {
                $query->select('users.id', 'users.name', 'users.email')->withPivot('last_read_at');
            },
        ])->findOrFail($id);
        $this->authorize('view', $conversation);

        return $this->ok($this->present($conversation, $request->user(), 0));
    }

    /**
     * Rename a group conversation.
     */
    public function update(Request $request, int $id)
    {
        $conversation = ChatConversation::findOrFail($id);
        $this->authorize('manage', $conversation);

        if (!$conversation->isGroup()) {
            abort(422, 'Only group conversations can be renamed.');
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $name = trim($validated['name']);
        abort_if($name === '', 422, 'Please provide a group name.');

        $conversation->update(['name' => $name]);

        ChatConversationChanged::dispatch($conversation->id, 'renamed', $this->memberIds($conversation));

        return $this->ok($conversation->load('participants:id,name,email'), 'Conversation renamed');
    }

    public function markRead(Request $request, int $id)
    {
        $conversation = ChatConversation::findOrFail($id);
        $this->authorize('view', $conversation);

        $conversation->participants()->updateExistingPivot($request->user()->id, [
            'last_read_at' => now(),
        ]);

        return $this->ok(null, 'Conversation marked as read');
    }

    public function addParticipant(Request $request, int $id)
    {
        $conversation = ChatConversation::findOrFail($id);
        $this->authorize('manage', $conversation);

        if (!$conversation->isGroup()) {
            abort(422, 'Participants can only be added to group conversations.');
        }

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $newUserId = (int) $validated['user_id'];
        $this->assertSameCompanyUser($request, $newUserId);

        $alreadyMember = $conversation->participants()->where('user_id', $newUserId)->exists();

        if (!$alreadyMember) {
            if ($conversation->participants()->count() >= self::MAX_GROUP_MEMBERS) {
                abort(422, 'This group has reached its member limit.');
            }

            $conversation->participants()->attach($newUserId);
            ChatConversationChanged::dispatch($conversation->id, 'member_added', $this->memberIds($conversation));
        }

        return $this->ok($conversation->load('participants:id,name,email'), 'Participant added successfully');
    }

    public function removeParticipant(Request $request, int $id, int $userId)
    {
        $conversation = ChatConversation::findOrFail($id);
        $this->authorize('manage', $conversation);

        if (!$conversation->isGroup()) {
            abort(422, 'Participants can only be removed from group conversations.');
        }

        if ($userId === (int) $request->user()->id) {
            abort(422, 'Use "leave group" to remove yourself.');
        }

        $isMember = $conversation->participants()->where('user_id', $userId)->exists();
        abort_unless($isMember, 404, 'That user is not in this conversation.');

        $conversation->participants()->detach($userId);

        // The removed user drops the thread; everyone else refreshes the roster.
        ChatConversationChanged::dispatch($conversation->id, 'removed', [$userId]);
        ChatConversationChanged::dispatch($conversation->id, 'member_removed', $this->memberIds($conversation));

        return $this->ok(null, 'Participant removed successfully');
    }

    /**
     * The current user leaves a group. If they were its creator, ownership
     * passes to the longest-standing remaining member.
     */
    public function leave(Request $request, int $id)
    {
        $conversation = ChatConversation::findOrFail($id);
        $user = $request->user();

        if (!$conversation->isGroup()) {
            abort(422, 'You can only leave group conversations.');
        }

        $isMember = $conversation->participants()->where('user_id', $user->id)->exists();
        abort_unless($isMember, 403, 'You are not a member of this conversation.');

        DB::transaction(function () use ($conversation, $user): void {
            $conversation->participants()->detach($user->id);

            if ((int) $conversation->created_by === (int) $user->id) {
                $next = $conversation->participants()->orderBy('chat_conversation_participants.created_at')->first();
                $conversation->update(['created_by' => $next?->id]);
            }
        });

        ChatConversationChanged::dispatch($conversation->id, 'left', $this->memberIds($conversation));

        return $this->ok(null, 'You left the conversation');
    }

    /**
     * Client-facing shape of a conversation, including whether the requesting
     * user may manage it (rename / change members).
     */
    private function present(ChatConversation $conversation, User $user, int $unreadCount): array
    {
        return [
            'id' => $conversation->id,
            'type' => $conversation->type,
            'name' => $conversation->name,
            'created_by' => $conversation->created_by,
            'can_manage' => $conversation->isGroup() && $user->can('manage', $conversation),
            'participants' => $conversation->participants,
            'last_message' => $conversation->relationLoaded('messages') ? $conversation->messages->first() : null,
            'unread_count' => $unreadCount,
            'created_at' => $conversation->created_at,
        ];
    }

    /**
     * @return int[]
     */
    private function memberIds(ChatConversation $conversation): array
    {
        return $conversation->participants()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
    }

    private function assertSameCompanyUser(Request $request, int $userId): void
    {
        $targetUser = User::query()->select(['id', 'company_id'])->findOrFail($userId);

        if ((string) ($targetUser->company_id ?? '') !== (string) ($request->user()?->company_id ?? '')) {
            abort(403, 'You cannot start a conversation with users outside your company.');
        }
    }
}
