<?php

namespace App\Http\Controllers;

use App\Models\PerformanceAppraisal;
use Illuminate\Http\Request;

class PerformanceAppraisalController extends Controller
{
    public function index(Request $request)
    {
        $query = PerformanceAppraisal::query()->with(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email']);

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('cycle', 'like', "%{$search}%")
                    ->orWhere('strengths', 'like', "%{$search}%")
                    ->orWhere('improvements', 'like', "%{$search}%");
            });
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'cycle' => 'required|string|max:100',
            'overall_score' => 'required|integer|min:1|max:5',
            'strengths' => 'nullable|string|max:10000',
            'improvements' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);

        $item = PerformanceAppraisal::create([
            ...$validated,
            'reviewer_id' => $validated['reviewer_id'] ?? $request->user()?->id,
        ]);

        return $this->ok($item->load(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email']), 'Performance appraisal created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(PerformanceAppraisal::with(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email'])->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $item = PerformanceAppraisal::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'cycle' => 'sometimes|string|max:100',
            'overall_score' => 'sometimes|integer|min:1|max:5',
            'strengths' => 'nullable|string|max:10000',
            'improvements' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);

        $item->update($validated);
        return $this->ok($item->load(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email']), 'Performance appraisal updated successfully');
    }

    public function destroy($id)
    {
        PerformanceAppraisal::findOrFail($id)->delete();
        return $this->ok(null, 'Performance appraisal deleted successfully');
    }
}
