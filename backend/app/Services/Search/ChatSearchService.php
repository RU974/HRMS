<?php

namespace App\Services\Search;

use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ChatSearchService
{
    public function search(User $user, string $query): array
    {
        $like = '%' . $this->sanitize($query) . '%';

        return ChatMessage::query()
            ->with(['sender:id,name,email,company_id', 'receiver:id,name,email,company_id'])
            ->where(function ($builder) use ($user): void {
                $builder->where('sender_id', $user->id)
                    ->orWhere('receiver_id', $user->id);

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
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('message', 'like', $like)
                    ->orWhereHas('sender', function ($senderQuery) use ($like): void {
                        $senderQuery->where('name', 'like', $like)
                            ->orWhere('email', 'like', $like);
                    })
                    ->orWhereHas('receiver', function ($receiverQuery) use ($like): void {
                        $receiverQuery->where('name', 'like', $like)
                            ->orWhere('email', 'like', $like);
                    });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->filter(fn (ChatMessage $message): bool => $this->canSee($user, $message))
            ->map(function (ChatMessage $message): array {
                $participants = trim(($message->sender?->name ?? 'Unknown sender') . ' to ' . ($message->receiver?->name ?? 'Unknown receiver'));

                return [
                    'id' => $message->id,
                    'title' => $participants,
                    'subtitle' => 'Chat message',
                    'detail' => Str::of($message->message)->limit(120)->toString(),
                    'path' => '/chat',
                ];
            })
            ->all();
    }

    private function canSee(User $user, ChatMessage $message): bool
    {
        if ($message->sender_id === $user->id || $message->receiver_id === $user->id) {
            return true;
        }

        if (!($user->can('chat:view') || $user->can('chat:manage_settings'))) {
            return false;
        }

        if (!$user->company_id) {
            return false;
        }

        if ($message->company_id) {
            return (string) $message->company_id === (string) $user->company_id;
        }

        return (string) ($message->sender?->company_id ?? $message->receiver?->company_id ?? '') === (string) $user->company_id;
    }

    private function sanitize(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }

    private function supportsCompanyScope(): bool
    {
        return Schema::hasColumn('chat_messages', 'company_id');
    }
}