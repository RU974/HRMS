<?php

namespace App\Http\Controllers;

use App\Models\PerformanceGoal;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PerformanceGoalController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'view performance');
        $query = PerformanceGoal::query()->with('employee:id,first_name,last_name,employee_number');

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('employee', function ($employeeQuery) use ($search) {
                        $employeeQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('employee_number', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage performance');
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

        return $this->ok($item->load('employee:id,first_name,last_name,employee_number'), 'Performance goal created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'view performance');
        return $this->ok(PerformanceGoal::with('employee:id,first_name,last_name,employee_number')->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'edit performance');
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
        return $this->ok($item->load('employee:id,first_name,last_name,employee_number'), 'Performance goal updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage performance');
        PerformanceGoal::findOrFail($id)->delete();
        return $this->ok(null, 'Performance goal deleted successfully');
    }
}
