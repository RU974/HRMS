<?php

namespace App\Http\Controllers;

use App\Models\ChatConversation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatConversationController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', ChatConversation::class);

        $user = $request->user();

        $conversations = ChatConversation::query()
            ->whereHas('participants', function ($query) use ($user): void {
                $query->where('user_id', $user->id);
            })
            ->with([
                'participants:id,name,email',
                'messages' => function ($query): void {
                    $query->latest()->limit(1)->with('sender:id,name,email');
                },
            ])
            ->get()
            ->map(function (ChatConversation $conversation) use ($user) {
                $myPivot = $conversation->participants->firstWhere('id', $user->id);
                $lastReadAt = $myPivot?->pivot?->last_read_at;

                $unreadCount = $conversation->messages()
                    ->where('sender_id', '!=', $user->id)
                    ->when($lastReadAt, fn ($query) => $query->where('created_at', '>', $lastReadAt), fn ($query) => $query)
                    ->count();

                return [
                    'id' => $conversation->id,
                    'type' => $conversation->type,
                    'name' => $conversation->name,
                    'participants' => $conversation->participants,
                    'last_message' => $conversation->messages->first(),
                    'unread_count' => $unreadCount,
                    'created_at' => $conversation->created_at,
                ];
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
            'participant_ids' => 'required|array|min:1',
            'participant_ids.*' => 'integer|exists:users,id',
        ]);

        $user = $request->user();
        $participantIds = array_unique(array_merge([$user->id], $validated['participant_ids']));

        foreach ($participantIds as $participantId) {
            $this->assertSameCompanyUser($request, (int) $participantId);
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

        $conversation = DB::transaction(function () use ($validated, $participantIds, $request, $user) {
            $conversation = ChatConversation::create([
                'type' => $validated['type'],
                'name' => $validated['name'] ?? null,
                'company_id' => $user->company_id,
                'created_by' => $user->id,
            ]);

            $conversation->participants()->attach($participantIds);

            return $conversation;
        });

        return $this->ok($conversation->load('participants:id,name,email'), 'Conversation created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $conversation = ChatConversation::with('participants:id,name,email')->findOrFail($id);
        $this->authorize('view', $conversation);

        return $this->ok($conversation);
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
        $this->authorize('update', $conversation);

        if (!$conversation->isGroup()) {
            abort(422, 'Participants can only be added to group conversations.');
        }

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
        ]);

        $this->assertSameCompanyUser($request, (int) $validated['user_id']);

        $conversation->participants()->syncWithoutDetaching([$validated['user_id']]);

        return $this->ok($conversation->load('participants:id,name,email'), 'Participant added successfully');
    }

    public function removeParticipant(Request $request, int $id, int $userId)
    {
        $conversation = ChatConversation::findOrFail($id);
        $this->authorize('update', $conversation);

        if (!$conversation->isGroup()) {
            abort(422, 'Participants can only be removed from group conversations.');
        }

        $conversation->participants()->detach($userId);

        return $this->ok(null, 'Participant removed successfully');
    }

    private function assertSameCompanyUser(Request $request, int $userId): void
    {
        $targetUser = User::query()->select(['id', 'company_id'])->findOrFail($userId);

        if ((string) ($targetUser->company_id ?? '') !== (string) ($request->user()?->company_id ?? '')) {
            abort(403, 'You cannot start a conversation with users outside your company.');
        }
    }
}
