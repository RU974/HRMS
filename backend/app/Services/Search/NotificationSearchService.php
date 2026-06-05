<?php

namespace App\Services\Search;

use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class NotificationSearchService
{
    public function search(User $user, string $query): array
    {
        $like = '%' . $this->sanitize($query) . '%';

        return NotificationItem::query()
            ->with(['user:id,name,email,company_id', 'creator:id,name,email,company_id'])
            ->where(function ($builder) use ($user): void {
                $builder->where('user_id', $user->id);

                if ($this->canView($user)) {
                    if ($user->company_id) {
                        if ($this->supportsCompanyScope()) {
                            $builder->orWhere('company_id', $user->company_id);
                        }

                        $builder->orWhereHas('creator', function ($creatorQuery) use ($user): void {
                                $creatorQuery->where('company_id', $user->company_id);
                            });
                    }
                }
            })
            ->where(function ($builder) use ($like): void {
                $builder->where('title', 'like', $like)
                    ->orWhere('message', 'like', $like)
                    ->orWhere('type', 'like', $like);
            })
            ->latest()
            ->limit(5)
            ->get()
            ->filter(fn (NotificationItem $notification): bool => $this->canSee($user, $notification))
            ->map(fn (NotificationItem $notification): array => [
                'id' => $notification->id,
                'title' => $notification->title,
                'subtitle' => ucfirst((string) $notification->type) . ' notification',
                'detail' => Str::of($notification->message)->limit(120)->toString(),
                'path' => '/notifications',
            ])
            ->all();
    }

    private function canSee(User $user, NotificationItem $notification): bool
    {
        if ($notification->user_id === $user->id) {
            return true;
        }

        if (!$this->canView($user)) {
            return false;
        }

        if (!$user->company_id) {
            return false;
        }

        if ($notification->company_id) {
            return (string) $notification->company_id === (string) $user->company_id;
        }

        return (string) ($notification->creator?->company_id ?? '') === (string) $user->company_id;
    }

    private function canView(User $user): bool
    {
        return $user->can('notification:view') || $this->canManage($user);
    }

    private function canManage(User $user): bool
    {
        return $user->can('notification:create')
            || $user->can('notification:edit')
            || $user->can('notification:delete');
    }

    private function sanitize(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }

    private function supportsCompanyScope(): bool
    {
        return Schema::hasColumn('notifications', 'company_id');
    }
}
