<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

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

        $query->where(function ($builder) use ($user): void {
            $builder->where('sender_id', $user->id)
                ->orWhere('receiver_id', $user->id);

            if ($user->can('view chat messages') || $user->can('manage chat messages')) {
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
            'receiver_id' => 'required|exists:users,id',
            'message' => 'required|string|max:5000',
        ]);

        $this->assertSameCompanyUser($request, (int) $validated['receiver_id']);

        $payload = [
            'sender_id' => $request->user()->id,
            'receiver_id' => $validated['receiver_id'],
            'message' => $validated['message'],
            'is_read' => false,
        ];

        if ($this->supportsCompanyScope()) {
            $payload['company_id'] = $request->user()?->company_id;
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
        $validated = $request->validate($isSender ? [
            'message' => 'sometimes|string|max:5000',
            'is_read' => 'sometimes|boolean',
        ] : [
            'is_read' => 'sometimes|boolean',
        ]);

        $message->update($validated);

        return $this->ok($message->fresh(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id']), 'Message updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $message = ChatMessage::with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('delete', $message);
        $message->delete();

        return $this->ok(null, 'Message deleted successfully');
    }

    private function assertSameCompanyUser(Request $request, int $userId): void
    {
        $targetUser = User::query()->select(['id', 'company_id'])->findOrFail($userId);

        if ((string) ($targetUser->company_id ?? '') !== (string) ($request->user()?->company_id ?? '')) {
            abort(403, 'You cannot message users outside your company.');
        }
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
