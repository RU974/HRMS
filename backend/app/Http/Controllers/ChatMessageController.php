<?php

namespace App\Http\Controllers;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ChatMessageController extends Controller
{
    public function users(Request $request)
    {
        $this->authorize('create', ChatMessage::class);

        $user = $request->user()->loadMissing('company');

        $query = User::query()
            ->select(['id', 'name', 'email'])
            ->orderBy('name');

        if ($user->company_id) {
            $query->where('company_id', $user->company_id);
        }

        return $this->ok($query->get());
    }

    public function index(Request $request)
    {
        $this->authorize('viewAny', ChatMessage::class);

        $user = $request->user()->loadMissing('company');
        $query = ChatMessage::query()->with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']);

        if ($request->filled('conversation_id')) {
            $conversation = ChatConversation::findOrFail((int) $request->query('conversation_id'));
            $this->authorize('view', $conversation);
            $query->where('conversation_id', $conversation->id);
        } else {
            $query->where(function ($builder) use ($user): void {
                $builder->where('sender_id', $user->id)
                    ->orWhere('receiver_id', $user->id)
                    ->orWhereHas('conversation.participants', function ($participantQuery) use ($user): void {
                        $participantQuery->where('user_id', $user->id);
                    });

                if ($user->can('chat:view') || $user->can('chat:manage_settings')) {
                    if ($user->company_id) {
                        if ($this->supportsCompanyScope()) {
                            $builder->orWhere('company_id', $user->company_id);
                        }

                        $builder->orWhereHas('sender', function ($senderQuery) use ($user): void {
                            $senderQuery->where('company_id', $user->company_id);
                        })
                        ->orWhereHas('receiver', function ($receiverQuery) use ($user): void {
                            $receiverQuery->where('company_id', $user->company_id);
                        });
                    }
                }
            });
        }

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

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->authorize('create', ChatMessage::class);

        $validated = $request->validate([
            'conversation_id' => 'required|exists:chat_conversations,id',
            'message' => 'nullable|string|max:5000',
            'file' => 'nullable|file|mimes:pdf,jpg,jpeg,png,gif,webp,doc,docx,xls,xlsx,zip|max:10240',
        ]);

        if (empty($validated['message']) && !$request->hasFile('file')) {
            abort(422, 'A message or attachment is required.');
        }

        $conversation = ChatConversation::findOrFail($validated['conversation_id']);
        $this->authorize('view', $conversation);

        $payload = [
            'conversation_id' => $conversation->id,
            'sender_id' => $request->user()->id,
            'message' => $validated['message'] ?? '',
            'is_read' => false,
        ];

        if ($conversation->type === 'direct') {
            $other = $conversation->participants()->where('user_id', '!=', $request->user()->id)->first();
            $payload['receiver_id'] = $other?->id ?? $request->user()->id;
        } else {
            $payload['receiver_id'] = $request->user()->id;
        }

        if ($this->supportsCompanyScope()) {
            $payload['company_id'] = $request->user()?->company_id;
        }

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $payload['attachment_path'] = $file->store('chat-attachments', 'public');
            $payload['attachment_name'] = $file->getClientOriginalName();
            $payload['attachment_mime'] = $file->getClientMimeType();
            $payload['attachment_size'] = $file->getSize();
        }

        $message = ChatMessage::create($payload);

        return $this->ok($message->load(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']), 'Message sent successfully', 201);
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

        $isSender = (int) $message->sender_id === (int) $request->user()->id;
        if (!$isSender) {
            abort(403, 'Only the sender can edit this message.');
        }

        $validated = $request->validate([
            'message' => 'required|string|max:5000',
        ]);

        $message->update($validated);

        return $this->ok($message->fresh(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']), 'Message updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $message = ChatMessage::with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('delete', $message);

        if ($message->hasAttachment() && Storage::disk('public')->exists($message->attachment_path)) {
            Storage::disk('public')->delete($message->attachment_path);
        }

        $message->delete();

        return $this->ok(null, 'Message deleted successfully');
    }

    public function downloadAttachment(Request $request, int $id): StreamedResponse
    {
        $message = ChatMessage::findOrFail($id);
        $this->authorize('view', $message);

        if (!$message->hasAttachment() || !Storage::disk('public')->exists($message->attachment_path)) {
            abort(404, 'Attachment not found.');
        }

        return Storage::disk('public')->download($message->attachment_path, $message->attachment_name ?? basename($message->attachment_path));
    }

    private function sanitizeQuery(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }

    private function supportsCompanyScope(): bool
    {
        return Schema::hasColumn('chat_messages', 'company_id');
    }
}
