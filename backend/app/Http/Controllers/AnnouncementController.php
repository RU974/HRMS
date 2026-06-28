<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Models\AnnouncementRead;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;


class AnnouncementController extends Controller
{
    private const ALLOWED_TAGS = '<p><br><strong><b><em><i><u><s><ul><ol><li><h1><h2><h3><blockquote><a><img>';

    public function index(Request $request)
    {
        $this->authorize('viewAny', Announcement::class);

        $user = $request->user()->loadMissing(['company', 'roles']);
        if (!$user->company_id) {
            return $this->ok([]);
        }

        $query = Announcement::query()->with(['creator:id,name,email,company_id', 'company:id,name']);

        $query->where(function ($builder) use ($user): void {
            if ($this->tableHasCompanyScope('announcements')) {
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
        });

        if ($request->filled('published')) {
            $published = filter_var($request->query('published'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($published !== null) {
                $query->where('is_published', $published);
            }
        }

        if ($request->filled('category')) {
            $query->where('category', $request->query('category'));
        }

        if ($request->filled('tag')) {
            $tag = (string) $request->query('tag');
            $query->where(function ($builder) use ($tag): void {
                $builder->whereJsonContains('tags', $tag);
            });
        }

        if ($request->filled('q')) {
            $search = $this->sanitizeQuery((string) $request->query('q'));
            $query->where(function ($builder) use ($search): void {
                $builder->where('title', 'like', '%' . $search . '%')
                    ->orWhere('body', 'like', '%' . $search . '%');
            });
        }

        $canManage = $user->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN])
            || $user->can('announcement:create')
            || $user->can('announcement:edit')
            || $user->can('announcement:delete');

        if (!$canManage) {
            $userRoles = $user->roles->pluck('name')->all();
            $isHr = !empty(array_intersect($userRoles, [
                User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE,
            ]));
            $isManager = !empty(array_intersect($userRoles, [
                User::ROLE_DEPARTMENT_MANAGER, User::ROLE_HR_MANAGER,
            ]));

            $query->where('is_published', true)
                ->where(function ($builder) use ($isHr, $isManager): void {
                    $builder->where('target', 'all')
                        ->orWhere('target', 'employees');
                    if ($isHr) {
                        $builder->orWhere('target', 'hr');
                    }
                    if ($isManager) {
                        $builder->orWhere('target', 'managers');
                    }
                });
        }

        $announcements = $query->latest()->get();

        $this->attachReadState($announcements, $user->id);

        return $this->ok($announcements);
    }

    public function store(Request $request)
    {
        // creation is allowed via role checks in policies; skip explicit authorize here

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string|max:20000',
            'target' => ['nullable', Rule::in(['all', 'hr', 'managers', 'employees'])],
            'category' => 'nullable|string|max:50',
            'tags' => 'nullable|array|max:10',
            'tags.*' => 'string|max:30',
            'is_published' => 'nullable|boolean',
            'published_at' => 'nullable|date',
        ]);

        [$isPublished, $publishedAt] = $this->resolvePublishState(
            (bool) ($validated['is_published'] ?? true),
            $validated['published_at'] ?? null,
        );

        $payload = [
            'title' => $validated['title'],
            'body' => $this->sanitizeHtml($validated['body']),
            'target' => $validated['target'] ?? 'all',
            'category' => $validated['category'] ?? null,
            'tags' => $validated['tags'] ?? [],
            'is_published' => $isPublished,
            'published_at' => $publishedAt,
            'created_by' => $request->user()?->id,
        ];

        if ($this->tableHasCompanyScope('announcements')) {
            $payload['company_id'] = $request->user()?->company_id;
        }

        $announcement = Announcement::create($payload);

        if ($announcement->is_published) {
            $this->broadcastAnnouncement($announcement, $request->user());
        }

        return $this->ok($announcement->load(['creator:id,name,email,company_id', 'company:id,name']), 'Announcement created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $announcement = Announcement::with(['creator:id,name,email,company_id', 'company:id,name'])->findOrFail($id);
        $this->authorize('view', $announcement);

        $collection = collect([$announcement]);
        $this->attachReadState($collection, $request->user()->id);

        return $this->ok($announcement);
    }

    public function update(Request $request, int $id)
    {
        $announcement = Announcement::with(['creator:id,name,email,company_id', 'company:id,name'])->findOrFail($id);
        $this->authorize('update', $announcement);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'body' => 'sometimes|string|max:20000',
            'target' => ['sometimes', Rule::in(['all', 'hr', 'managers', 'employees'])],
            'category' => 'nullable|string|max:50',
            'tags' => 'nullable|array|max:10',
            'tags.*' => 'string|max:30',
            'is_published' => 'sometimes|boolean',
            'published_at' => 'nullable|date',
        ]);

        if (array_key_exists('body', $validated)) {
            $validated['body'] = $this->sanitizeHtml($validated['body']);
        }

        $wasPublished = $announcement->is_published;
        $announcement->fill($validated);

        if (array_key_exists('is_published', $validated) || array_key_exists('published_at', $validated)) {
            [$isPublished, $publishedAt] = $this->resolvePublishState(
                (bool) ($announcement->is_published),
                array_key_exists('published_at', $validated) ? $validated['published_at'] : $announcement->published_at,
            );
            $announcement->is_published = $isPublished;
            $announcement->published_at = $publishedAt;
        }

        $announcement->save();

        if (!$wasPublished && $announcement->is_published) {
            $this->broadcastAnnouncement($announcement, $request->user());
        }

        return $this->ok($announcement->fresh(['creator:id,name,email,company_id', 'company:id,name']), 'Announcement updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $announcement = Announcement::with(['creator:id,name,email,company_id', 'company:id,name'])->findOrFail($id);
        $this->authorize('delete', $announcement);
        $announcement->delete();

        return $this->ok(null, 'Announcement deleted successfully');
    }

    public function markRead(Request $request, int $id)
    {
        $announcement = Announcement::findOrFail($id);
        $this->authorize('view', $announcement);

        AnnouncementRead::query()->updateOrCreate(
            ['announcement_id' => $announcement->id, 'user_id' => $request->user()->id],
            ['read_at' => now()],
        );

        return $this->ok(['reads_count' => $announcement->reads()->count()], 'Marked as read');
    }

    public function reads(Request $request, int $id)
    {
        $announcement = Announcement::findOrFail($id);
        $this->authorize('update', $announcement);

        $reads = $announcement->reads()
            ->with('user:id,name,email')
            ->orderByDesc('read_at')
            ->get();

        return $this->ok($reads);
    }

    /**
     * Publish announcements whose scheduled published_at has arrived. Returns the count published.
     */
    public function publishDueScheduled(): int
    {
        $due = Announcement::query()
            ->where('is_published', false)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->get();

        foreach ($due as $announcement) {
            $announcement->is_published = true;
            $announcement->save();

            $this->broadcastAnnouncement($announcement, $announcement->creator);
        }

        return $due->count();
    }

    public function uploadImage(Request $request)
    {
        $validated = $request->validate([
            'image' => 'required|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
        ]);

        $path = $validated['image']->store('announcement-images', 'public');

        return $this->ok(['url' => Storage::disk('public')->url($path)], 'Image uploaded successfully', 201);
    }

    /**
     * Decide whether the announcement should be published now, scheduled for later, or kept as a draft.
     *
     * @return array{0: bool, 1: \Illuminate\Support\Carbon|string|null}
     */
    private function resolvePublishState(bool $requestedPublished, ?string $publishedAt): array
    {
        if (!$requestedPublished) {
            return [false, null];
        }

        if ($publishedAt === null) {
            return [true, now()];
        }

        $when = now()->parse($publishedAt);

        if ($when->isFuture()) {
            // Scheduled: stays unpublished until PublishScheduledAnnouncements picks it up.
            return [false, $when];
        }

        return [true, $when];
    }

    private function sanitizeHtml(string $html): string
    {
        $clean = strip_tags($html, self::ALLOWED_TAGS);
        $clean = preg_replace('/\s+on\w+\s*=\s*"[^"]*"/i', '', $clean) ?? $clean;
        $clean = preg_replace("/\s+on\w+\s*=\s*'[^']*'/i", '', $clean) ?? $clean;
        $clean = preg_replace('/(href|src)\s*=\s*"javascript:[^"]*"/i', '$1=""', $clean) ?? $clean;

        return $clean;
    }

    private function attachReadState($announcements, int $userId): void
    {
        $ids = $announcements->pluck('id')->all();
        if (empty($ids)) {
            return;
        }

        $counts = AnnouncementRead::query()
            ->whereIn('announcement_id', $ids)
            ->selectRaw('announcement_id, count(*) as count')
            ->groupBy('announcement_id')
            ->pluck('count', 'announcement_id');

        $readByMe = AnnouncementRead::query()
            ->whereIn('announcement_id', $ids)
            ->where('user_id', $userId)
            ->pluck('announcement_id')
            ->flip();

        foreach ($announcements as $announcement) {
            $announcement->setAttribute('reads_count', (int) ($counts[$announcement->id] ?? 0));
            $announcement->setAttribute('read_by_me', $readByMe->has($announcement->id));
        }
    }

    private function sanitizeQuery(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }


    private function broadcastAnnouncement(Announcement $announcement, ?User $creator): void
    {
        $audienceQuery = User::query()->select(['id', 'company_id']);

        if ($creator?->company_id) {
            $audienceQuery->where('company_id', $creator->company_id);
        }

        $audienceQuery->where(function ($builder) use ($announcement): void {
            if ($announcement->target === 'all') {
                return;
            }

            if ($announcement->target === 'hr') {
                $builder->whereHas('roles', function ($roleQuery): void {
                    $roleQuery->whereIn('name', [
                        User::ROLE_HR_MANAGER,
                        User::ROLE_HR_EXECUTIVE,
                        User::ROLE_COMPANY_ADMIN,
                        User::ROLE_SUPER_ADMIN,
                    ]);
                });

                return;
            }

            if ($announcement->target === 'managers') {
                $builder->whereHas('roles', function ($roleQuery): void {
                    $roleQuery->whereIn('name', [
                        User::ROLE_DEPARTMENT_MANAGER,
                        User::ROLE_HR_MANAGER,
                        User::ROLE_COMPANY_ADMIN,
                        User::ROLE_SUPER_ADMIN,
                    ]);
                });

                return;
            }

            $builder->whereHas('roles', function ($roleQuery): void {
                $roleQuery->where('name', User::ROLE_EMPLOYEE);
            });
        });

        $recipientIds = $audienceQuery
            ->pluck('id')
            ->merge([$creator?->id])
            ->filter()
            ->unique()
            ->values();

        if ($recipientIds->isEmpty()) {
            return;
        }

        $users = User::query()
            ->select(['id', 'company_id'])
            ->whereIn('id', $recipientIds->all())
            ->get();

        $now = now()->toDateTimeString();
        $rows = $users->map(fn (User $recipient) => [
            'title' => $announcement->title,
            'message' => $announcement->body,
            'type' => 'info',
            'is_read' => false,
            'user_id' => $recipient->id,
            'created_by' => $creator?->id,
            'company_id' => $this->tableHasCompanyScope('announcements') ? $recipient->company_id : null,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        if (!empty($rows)) {
            DB::transaction(static fn () => NotificationItem::query()->insert($rows));
        }
    }
}
