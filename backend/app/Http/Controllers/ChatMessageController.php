<?php

namespace App\Http\Controllers;

use App\Events\ChatInboxUpdated;
use App\Events\ChatMessageDeleted;
use App\Events\ChatMessageSent;
use App\Events\ChatMessageUpdated;
use App\Models\CallParticipant;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ChatMessageController extends Controller
{
    /** Disk new attachments are written to. Private: only reachable through the authorised download endpoint. */
    private const ATTACHMENT_DISK = 'local';

    /** Disks searched when reading, so attachments stored before the move to a private disk still resolve. */
    private const ATTACHMENT_READ_DISKS = ['local', 'public'];

    public function users(Request $request)
    {
        $this->authorize('create', ChatMessage::class);

        $query = User::query()
            ->select(['id', 'name', 'email', 'last_seen_at'])
            ->orderBy('name');

        $this->scopeToCompany($request, $query);

        $onlineThreshold = now()->subMinutes(2);

        $users = $query->get();

        // Single query to find which users are currently on an active call
        $inCallUserIds = CallParticipant::query()
            ->whereIn('user_id', $users->pluck('id'))
            ->where('status', 'joined')
            ->whereHas('call', fn ($q) => $q->where('status', 'active'))
            ->pluck('user_id')
            ->flip()
            ->toArray();

        return $this->ok(
            $users->map(fn ($u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'email'      => $u->email,
                'is_online'  => (bool) ($u->last_seen_at && $u->last_seen_at->gt($onlineThreshold)),
                'is_in_call' => isset($inCallUserIds[$u->id]),
            ])
        );
    }

    public function index(Request $request)
    {
        $this->authorize('viewAny', ChatMessage::class);

        if ($request->filled('conversation_id')) {
            return $this->conversationThread($request);
        }

        $user = $request->user()->loadMissing('company');
        $query = ChatMessage::query()->with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']);

        $query->where(function ($builder) use ($user): void {
            $builder->where('sender_id', $user->id)
                ->orWhere('receiver_id', $user->id)
                ->orWhereHas('conversation.participants', function ($participantQuery) use ($user): void {
                    $participantQuery->where('user_id', $user->id);
                });

            // Company-wide read access is a moderation power, not a side effect of
            // being allowed to use chat: only chat administrators get it.
            if ($user->can('chat:manage_settings') && $user->company_id) {
                if ($this->tableHasCompanyScope('chat_messages')) {
                    $builder->orWhere('company_id', $user->company_id);
                }

                $builder->orWhereHas('sender', function ($senderQuery) use ($user): void {
                    $senderQuery->where('company_id', $user->company_id);
                });
            }
        });

        if ($request->filled('q')) {
            $search = $this->sanitizeQuery((string) $request->query('q'));
            $query->where(function ($builder) use ($search): void {
                $builder->where('message', 'like', '%' . $search . '%')
                    ->orWhereHas('sender', function ($senderQuery) use ($search): void {
                        $senderQuery->where('name', 'like', '%' . $search . '%')
                            ->orWhere('email', 'like', '%' . $search . '%');
                    })
                    ->orWhereHas('receiver', function ($receiverQuery) use ($search): void {
                        $receiverQuery->where('name', 'like', '%' . $search . '%')
                            ->orWhere('email', 'like', '%' . $search . '%');
                    });
            });
        }

        if ($request->filled('sender_id')) {
            $query->where('sender_id', (int) $request->query('sender_id'));
        }

        if ($request->filled('receiver_id')) {
            $query->where('receiver_id', (int) $request->query('receiver_id'));
        }

        if ($request->filled('read')) {
            $readValue = $request->query('read') === 'true' || $request->query('read') === 'read';
            $query->where('is_read', $readValue);
        }

        $perPage = min((int) $request->query('per_page', 50), 200);

        return $this->ok($query->latest()->paginate($perPage));
    }

    public function store(Request $request)
    {
        $this->authorize('create', ChatMessage::class);

        $validated = $request->validate([
            'conversation_id' => 'required|exists:chat_conversations,id',
            'message' => 'nullable|string|max:5000',
            'file' => 'nullable|file|mimes:pdf,jpg,jpeg,png,gif,webp,doc,docx,xls,xlsx,zip|max:10240',
        ]);

        if (trim((string) ($validated['message'] ?? '')) === '' && !$request->hasFile('file')) {
            abort(422, 'A message or attachment is required.');
        }

        $conversation = ChatConversation::with('participants:id,name')->findOrFail($validated['conversation_id']);
        $this->authorize('view', $conversation);

        // Only members may post. Company chat admins can view any conversation
        // for moderation, but must not be able to speak in one they are not in.
        $isMember = $conversation->participants->contains('id', $request->user()->id);
        abort_unless($isMember, 403, 'You are not a member of this conversation.');

        $payload = [
            'conversation_id' => $conversation->id,
            'sender_id' => $request->user()->id,
            'message' => trim((string) ($validated['message'] ?? '')),
            'is_read' => false,
        ];

        // direct: the other person; group: no single receiver.
        if ($conversation->type === 'direct') {
            $payload['receiver_id'] = $conversation->participants->firstWhere('id', '!=', $request->user()->id)?->id
                ?? $request->user()->id;
        } else {
            $payload['receiver_id'] = null;
        }

        if ($this->tableHasCompanyScope('chat_messages')) {
            $payload['company_id'] = $request->user()?->company_id;
        }

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $payload['attachment_path'] = $file->store('chat-attachments', self::ATTACHMENT_DISK);
            $payload['attachment_name'] = Str::limit(basename($file->getClientOriginalName()), 200, '');
            $payload['attachment_mime'] = $file->getMimeType() ?: $file->getClientMimeType();
            $payload['attachment_size'] = $file->getSize();
        }

        $message = ChatMessage::create($payload);
        $message->load(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']);

        ChatMessageSent::dispatch($message);

        $recipientIds = $conversation->participants
            ->pluck('id')
            ->reject(fn ($id) => (int) $id === (int) $request->user()->id)
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        if ($recipientIds !== []) {
            ChatInboxUpdated::dispatch(
                $conversation->id,
                $message->id,
                (int) $request->user()->id,
                (string) $request->user()->name,
                $conversation->type === 'group' ? $conversation->name : null,
                $this->previewFor($message),
                $recipientIds,
            );
        }

        return $this->ok($message, 'Message sent successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $message = ChatMessage::with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('view', $message);

        return $this->ok($message);
    }

    public function update(Request $request, int $id)
    {
        $message = ChatMessage::with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('update', $message);

        if ((int) $message->sender_id !== (int) $request->user()->id) {
            abort(403, 'Only the sender can edit this message.');
        }

        $validated = $request->validate([
            'message' => 'required|string|max:5000',
        ]);

        $text = trim($validated['message']);
        abort_if($text === '', 422, 'Message cannot be empty.');

        if ($text !== $message->message) {
            $message->update(['message' => $text, 'edited_at' => now()]);
        }

        $message = $message->fresh(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']);

        if ($message->conversation_id) {
            ChatMessageUpdated::dispatch($message);
        }

        return $this->ok($message, 'Message updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $message = ChatMessage::findOrFail($id);
        $this->authorize('delete', $message);

        if ($message->hasAttachment()) {
            foreach (self::ATTACHMENT_READ_DISKS as $disk) {
                Storage::disk($disk)->delete($message->attachment_path);
            }
        }

        $conversationId = $message->conversation_id;

        // Soft delete: the thread keeps a "message deleted" placeholder.
        $message->delete();

        if ($conversationId) {
            ChatMessageDeleted::dispatch($message->id, (int) $conversationId);
        }

        return $this->ok(null, 'Message deleted successfully');
    }

    public function downloadAttachment(Request $request, int $id): StreamedResponse
    {
        $message = ChatMessage::findOrFail($id);
        $this->authorize('view', $message);

        $disk = $message->hasAttachment() ? $this->attachmentDisk($message->attachment_path) : null;

        if ($disk === null) {
            abort(404, 'Attachment not found.');
        }

        return Storage::disk($disk)->download(
            $message->attachment_path,
            $message->attachment_name ?? basename($message->attachment_path),
            ['X-Content-Type-Options' => 'nosniff']
        );
    }

    /**
     * Cursor-paginated thread for one conversation: the newest `limit`
     * messages, or the `limit` messages older than `before_id`. Deleted
     * messages are included as placeholders so the thread reads correctly.
     */
    private function conversationThread(Request $request)
    {
        $conversation = ChatConversation::findOrFail((int) $request->query('conversation_id'));
        $this->authorize('view', $conversation);

        $limit = min(max((int) $request->query('limit', 50), 1), 100);

        $query = ChatMessage::withTrashed()
            ->with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id'])
            ->where('conversation_id', $conversation->id);

        if ($request->filled('before_id')) {
            $query->where('id', '<', (int) $request->query('before_id'));
        }

        if ($request->filled('q')) {
            $search = $this->sanitizeQuery((string) $request->query('q'));
            $query->whereNull('deleted_at')->where('message', 'like', '%' . $search . '%');
        }

        $rows = $query->orderByDesc('id')->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;

        return $this->ok([
            'data' => $rows->take($limit)->reverse()->values(),
            'has_more' => $hasMore,
        ]);
    }

    private function attachmentDisk(string $path): ?string
    {
        foreach (self::ATTACHMENT_READ_DISKS as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return $disk;
            }
        }

        return null;
    }

    private function previewFor(ChatMessage $message): string
    {
        $text = trim((string) $message->message);

        if ($text === '') {
            return $message->hasAttachment() ? 'Sent an attachment' : '';
        }

        return Str::limit($text, 100);
    }

    private function sanitizeQuery(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }
}
