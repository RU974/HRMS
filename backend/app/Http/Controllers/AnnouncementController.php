<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AnnouncementController extends Controller
{
    public function index(Request $request)
    {
        $query = Announcement::query()->with('creator:id,name,email');

        if ($request->filled('published')) {
            $published = filter_var($request->query('published'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($published !== null) {
                $query->where('is_published', $published);
            }
        }

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('body', 'like', "%{$search}%");
            });
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
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

        $announcement = Announcement::create([
            'title' => $validated['title'],
            'body' => $validated['body'],
            'target' => $validated['target'] ?? 'all',
            'is_published' => $isPublished,
            'published_at' => $isPublished ? $publishedAt : null,
            'created_by' => $request->user()?->id,
        ]);

        return $this->ok($announcement->load('creator:id,name,email'), 'Announcement created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(Announcement::with('creator:id,name,email')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $announcement = Announcement::findOrFail($id);

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

        return $this->ok($announcement->load('creator:id,name,email'), 'Announcement updated successfully');
    }

    public function destroy($id)
    {
        Announcement::findOrFail($id)->delete();
        return $this->ok(null, 'Announcement deleted successfully');
    }
}
