<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Models\NotificationItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;


class AnnouncementController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Announcement::class);

        $user = $request->user()->loadMissing('company');
        if (!$user->company_id) {
            return $this->ok([]);
        }

        $query = Announcement::query()->with(['creator:id,name,email,company_id', 'company:id,name']);

        $query->where(function ($builder) use ($user): void {
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
        });

        if ($request->filled('published')) {
            $published = filter_var($request->query('published'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($published !== null) {
                $query->where('is_published', $published);
            }
        }

        if ($request->filled('q')) {
            $search = $this->sanitizeQuery((string) $request->query('q'));
            $query->where(function ($builder) use ($search): void {
                $builder->where('title', 'like', '%' . $search . '%')
                    ->orWhere('body', 'like', '%' . $search . '%');
            });
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        // creation is allowed via role checks in policies; skip explicit authorize here

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string|max:10000',
            'target' => ['nullable', Rule::in(['all', 'hr', 'managers', 'employees'])],
            'is_published' => 'nullable|boolean',
            'published_at' => 'nullable|date',
        ]);

        $isPublished = (bool) ($validated['is_published'] ?? true);
        $publishedAt = $validated['published_at'] ?? null;

        if ($isPublished && $publishedAt === null) {
            $publishedAt = now();
        }

        $payload = [
            'title' => $validated['title'],
            'body' => $validated['body'],
            'target' => $validated['target'] ?? 'all',
            'is_published' => $isPublished,
            'published_at' => $isPublished ? $publishedAt : null,
            'created_by' => $request->user()?->id,
        ];

        if ($this->supportsCompanyScope()) {
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

        return $this->ok($announcement);
    }

    public function update(Request $request, int $id)
    {
        $announcement = Announcement::with(['creator:id,name,email,company_id', 'company:id,name'])->findOrFail($id);
        $this->authorize('update', $announcement);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'body' => 'sometimes|string|max:10000',
            'target' => ['sometimes', Rule::in(['all', 'hr', 'managers', 'employees'])],
            'is_published' => 'sometimes|boolean',
            'published_at' => 'nullable|date',
        ]);

        $announcement->fill($validated);

        if (array_key_exists('is_published', $validated)) {
            if ((bool) $validated['is_published'] === true && empty($validated['published_at']) && $announcement->published_at === null) {
                $announcement->published_at = now();
            }

            if ((bool) $validated['is_published'] === false) {
                $announcement->published_at = null;
            }
        }

        if (array_key_exists('published_at', $validated) && !($announcement->is_published)) {
            $announcement->published_at = null;
        }

        $announcement->save();

        return $this->ok($announcement->fresh(['creator:id,name,email,company_id', 'company:id,name']), 'Announcement updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $announcement = Announcement::with(['creator:id,name,email,company_id', 'company:id,name'])->findOrFail($id);
        $this->authorize('delete', $announcement);
        $announcement->delete();

        return $this->ok(null, 'Announcement deleted successfully');
    }

    private function sanitizeQuery(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }

    private function supportsCompanyScope(): bool
    {
        return Schema::hasColumn('announcements', 'company_id');
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
            'company_id' => $this->supportsCompanyScope() ? $recipient->company_id : null,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        if (!empty($rows)) {
            DB::transaction(static fn () => NotificationItem::query()->insert($rows));
        }
    }
}
