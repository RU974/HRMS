<?php

namespace App\Http\Controllers;

use App\Models\PerformanceReview;
use Illuminate\Http\Request;

class PerformanceReviewController extends Controller
{
    public function index(Request $request)
    {
        $query = PerformanceReview::query()->with(['employee:id,first_name,last_name,employee_code', 'reviewer:id,name,email']);

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('period', 'like', "%{$search}%")
                    ->orWhere('summary', 'like', "%{$search}%");
            });
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'period' => 'required|string|max:100',
            'rating' => 'required|integer|min:1|max:5',
            'summary' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);

        $item = PerformanceReview::create([
            ...$validated,
            'reviewer_id' => $validated['reviewer_id'] ?? $request->user()?->id,
        ]);

        return $this->ok($item->load(['employee:id,first_name,last_name,employee_code', 'reviewer:id,name,email']), 'Performance review created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(PerformanceReview::with(['employee:id,first_name,last_name,employee_code', 'reviewer:id,name,email'])->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $item = PerformanceReview::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'period' => 'sometimes|string|max:100',
            'rating' => 'sometimes|integer|min:1|max:5',
            'summary' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);

        $item->update($validated);
        return $this->ok($item->load(['employee:id,first_name,last_name,employee_code', 'reviewer:id,name,email']), 'Performance review updated successfully');
    }

    public function destroy($id)
    {
        PerformanceReview::findOrFail($id)->delete();
        return $this->ok(null, 'Performance review deleted successfully');
    }
}
