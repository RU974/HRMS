<?php

namespace App\Services\Search;

use App\Models\Announcement;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AnnouncementSearchService
{
    public function search(User $user, string $query): array
    {
        if (!$this->canView($user) || !$user->company_id) {
            return [];
        }

        $like = '%' . $this->sanitize($query) . '%';

        return Announcement::query()
            ->with('creator:id,name,email,company_id')
            ->where(function ($builder) use ($user, $like): void {
                if ($this->supportsCompanyScope()) {
                    $builder->where('company_id', $user->company_id)
                        ->orWhere(function ($legacyQuery) use ($user): void {
                            $legacyQuery->whereNull('company_id')
                                ->whereHas('creator', function ($creatorQuery) use ($user): void {
                                    $creatorQuery->where('company_id', $user->company_id);
                                });
                        });
                } else {
                    $builder->whereHas('creator', function ($creatorQuery) use ($user): void {
                        $creatorQuery->where('company_id', $user->company_id);
                    });
                }

                $builder->where(function ($announcementQuery) use ($like, $user): void {
                    $announcementQuery->where('title', 'like', $like)
                        ->orWhere('body', 'like', $like)
                        ->orWhereHas('creator', function ($creatorQuery) use ($like, $user): void {
                            $creatorQuery->where('name', 'like', $like);
                            if ($user->company_id) {
                                $creatorQuery->where('company_id', $user->company_id);
                            }
                        });
                });
            })
            ->latest()
            ->limit(5)
            ->get()
            ->filter(fn (Announcement $announcement): bool => $this->canSeeAnnouncement($user, $announcement))
            ->map(fn (Announcement $announcement): array => [
                'id' => $announcement->id,
                'title' => $announcement->title,
                'subtitle' => $announcement->is_published ? 'Published announcement' : 'Draft announcement',
                'detail' => Str::of($announcement->body)->limit(120)->toString(),
                'path' => '/announcements',
            ])
            ->all();
    }

    private function canView(User $user): bool
    {
        return $user->can('view announcements') || $user->can('manage announcements');
    }

    private function canSeeAnnouncement(User $user, Announcement $announcement): bool
    {
        if ($user->can('manage announcements') || $user->can('manage settings')) {
            return $this->sameCompany($user, $announcement);
        }

        return ($user->can('view announcements') || $user->can('manage announcements'))
            && $announcement->is_published
            && $this->sameCompany($user, $announcement)
            && $this->matchesTarget($user, $announcement);
    }

    private function sameCompany(User $user, Announcement $announcement): bool
    {
        if (!$user->company_id) {
            return false;
        }

        if ($announcement->company_id) {
            return (string) $announcement->company_id === (string) $user->company_id;
        }

        return (string) ($announcement->creator?->company_id ?? '') === (string) $user->company_id;
    }

    private function matchesTarget(User $user, Announcement $announcement): bool
    {
        return $announcement->target === 'all'
            || ($announcement->target === 'employees' && $user->can('view employee announcements'))
            || ($announcement->target === 'hr' && $user->can('view hr announcements'))
            || ($announcement->target === 'managers' && $user->can('view manager announcements'));
    }

    private function sanitize(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }

    private function supportsCompanyScope(): bool
    {
        return Schema::hasColumn('announcements', 'company_id');
    }
}
