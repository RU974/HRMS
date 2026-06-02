<?php

namespace App\Http\Controllers;

use App\Models\NotificationItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', NotificationItem::class);

        $user = $request->user()->loadMissing('company');
        $query = NotificationItem::query()->with(['user:id,name,email,company_id', 'creator:id,name,email,company_id']);

        $query->where(function ($builder) use ($user): void {
            $builder->where('user_id', $user->id);

            if ($user->can('view notifications') || $user->can('manage notifications')) {
                if ($user->company_id) {
                    if ($this->supportsCompanyScope()) {
                        $builder->orWhere('company_id', $user->company_id);
                    }

                    $builder->orWhereHas('creator', function ($creatorQuery) use ($user): void {
                        $creatorQuery->where('company_id', $user->company_id);
                    });
                }
            }
        });

        if ($request->filled('q')) {
            $search = $this->sanitizeQuery((string) $request->query('q'));
            $query->where(function ($builder) use ($search): void {
                $builder->where('title', 'like', '%' . $search . '%')
                    ->orWhere('message', 'like', '%' . $search . '%')
                    ->orWhere('type', 'like', '%' . $search . '%');
            });
        }

        if ($request->filled('read')) {
            $read = filter_var($request->query('read'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($read !== null) {
                $query->where('is_read', $read);
            }
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->authorize('create', NotificationItem::class);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string|max:5000',
            'type' => ['nullable', Rule::in(['info', 'warning', 'success', 'error'])],
            'is_read' => 'nullable|boolean',
            'user_id' => 'nullable|exists:users,id',
        ]);

        $targetUserId = $validated['user_id'] ?? $request->user()?->id;

        if ($targetUserId !== null) {
            if (!$request->user()->can('manage notifications') && (int) $targetUserId !== (int) $request->user()->id) {
                abort(403, 'You can only create notifications for yourself.');
            }

            $this->assertSameCompanyUser($request, (int) $targetUserId);
        }

        $payload = [
            ...$validated,
            'user_id' => $targetUserId,
            'type' => $validated['type'] ?? 'info',
            'is_read' => (bool) ($validated['is_read'] ?? false),
            'created_by' => $request->user()?->id,
        ];

        if ($this->supportsCompanyScope()) {
            $payload['company_id'] = $request->user()?->company_id;
        }

        $item = NotificationItem::create($payload);

        return $this->ok($item->load(['user:id,name,email,company_id', 'creator:id,name,email,company_id']), 'Notification created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $item = NotificationItem::with(['user:id,name,email,company_id', 'creator:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('view', $item);

        return $this->ok($item);
    }

    public function update(Request $request, int $id)
    {
        $item = NotificationItem::with(['user:id,name,email,company_id', 'creator:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('update', $item);

        $isManager = $request->user()->can('manage notifications');
        $validated = $request->validate($isManager ? [
            'title' => 'sometimes|string|max:255',
            'message' => 'sometimes|string|max:5000',
            'type' => ['sometimes', Rule::in(['info', 'warning', 'success', 'error'])],
            'is_read' => 'sometimes|boolean',
            'user_id' => 'nullable|exists:users,id',
        ] : [
            'is_read' => 'sometimes|boolean',
        ]);

        if ($isManager && array_key_exists('user_id', $validated) && $validated['user_id'] !== null) {
            $this->assertSameCompanyUser($request, (int) $validated['user_id']);
        }

        $item->update($validated);

        return $this->ok($item->fresh(['user:id,name,email,company_id', 'creator:id,name,email,company_id']), 'Notification updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $item = NotificationItem::with(['user:id,name,email,company_id', 'creator:id,name,email,company_id'])->findOrFail($id);
        $this->authorize('delete', $item);
        $item->delete();

        return $this->ok(null, 'Notification deleted successfully');
    }

    private function assertSameCompanyUser(Request $request, int $userId): void
    {
        $targetUser = \App\Models\User::query()->select(['id', 'company_id'])->findOrFail($userId);

        if ((string) ($targetUser->company_id ?? '') !== (string) ($request->user()?->company_id ?? '')) {
            abort(403, 'You cannot assign notifications outside your company.');
        }
    }

    private function sanitizeQuery(string $query): string
    {
        return trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? $query);
    }

    private function supportsCompanyScope(): bool
    {
        return Schema::hasColumn('notifications', 'company_id');
    }
}
