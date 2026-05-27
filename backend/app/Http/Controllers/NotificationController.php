<?php

namespace App\Http\Controllers;

use App\Models\NotificationItem;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $query = NotificationItem::query()->with(['user:id,name,email', 'creator:id,name,email']);

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('message', 'like', "%{$search}%");
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
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string|max:5000',
            'type' => ['nullable', Rule::in(['info', 'warning', 'success', 'error'])],
            'is_read' => 'nullable|boolean',
            'user_id' => 'nullable|exists:users,id',
        ]);

        $item = NotificationItem::create([
            ...$validated,
            'type' => $validated['type'] ?? 'info',
            'is_read' => (bool) ($validated['is_read'] ?? false),
            'created_by' => $request->user()?->id,
        ]);

        return $this->ok($item->load(['user:id,name,email', 'creator:id,name,email']), 'Notification created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(NotificationItem::with(['user:id,name,email', 'creator:id,name,email'])->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $item = NotificationItem::findOrFail($id);
        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'message' => 'sometimes|string|max:5000',
            'type' => ['sometimes', Rule::in(['info', 'warning', 'success', 'error'])],
            'is_read' => 'sometimes|boolean',
            'user_id' => 'nullable|exists:users,id',
        ]);

        $item->update($validated);
        return $this->ok($item->load(['user:id,name,email', 'creator:id,name,email']), 'Notification updated successfully');
    }

    public function destroy($id)
    {
        NotificationItem::findOrFail($id)->delete();
        return $this->ok(null, 'Notification deleted successfully');
    }
}
