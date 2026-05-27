<?php

namespace App\Http\Controllers;

use App\Models\PerformanceGoal;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PerformanceGoalController extends Controller
{
    public function index(Request $request)
    {
        $query = PerformanceGoal::query()->with('employee:id,first_name,last_name,employee_code');

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:10000',
            'due_date' => 'nullable|date',
            'progress' => 'nullable|integer|min:0|max:100',
            'status' => ['nullable', Rule::in(['not_started', 'in_progress', 'completed', 'on_hold'])],
        ]);

        $item = PerformanceGoal::create([
            ...$validated,
            'progress' => $validated['progress'] ?? 0,
            'status' => $validated['status'] ?? 'not_started',
        ]);

        return $this->ok($item->load('employee:id,first_name,last_name,employee_code'), 'Performance goal created successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(PerformanceGoal::with('employee:id,first_name,last_name,employee_code')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $item = PerformanceGoal::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:10000',
            'due_date' => 'nullable|date',
            'progress' => 'sometimes|integer|min:0|max:100',
            'status' => ['sometimes', Rule::in(['not_started', 'in_progress', 'completed', 'on_hold'])],
        ]);

        $item->update($validated);
        return $this->ok($item->load('employee:id,first_name,last_name,employee_code'), 'Performance goal updated successfully');
    }

    public function destroy($id)
    {
        PerformanceGoal::findOrFail($id)->delete();
        return $this->ok(null, 'Performance goal deleted successfully');
    }
}
