<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PerformanceGoal;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PerformanceGoalController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'performance:view');
        $query = PerformanceGoal::query()->with('employee:id,first_name,last_name,employee_number');
        $this->scopeToCompany($request, $query);

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

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:10000',
            'due_date' => 'nullable|date',
            'progress' => 'nullable|integer|min:0|max:100',
            'status' => ['nullable', Rule::in(['not_started', 'in_progress', 'completed', 'on_hold'])],
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $item = PerformanceGoal::create([
            ...$validated,
            'progress' => $validated['progress'] ?? 0,
            'status' => $validated['status'] ?? 'not_started',
        ]);

        return $this->ok($item->load('employee:id,first_name,last_name,employee_number'), 'Performance goal created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:view');
        $item = PerformanceGoal::with('employee:id,first_name,last_name,employee_number')->findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        return $this->ok($item);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:edit');
        $item = PerformanceGoal::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:10000',
            'due_date' => 'nullable|date',
            'progress' => 'sometimes|integer|min:0|max:100',
            'status' => ['sometimes', Rule::in(['not_started', 'in_progress', 'completed', 'on_hold'])],
        ]);
        $this->assertEmployeeInCompany($request, (int) ($validated['employee_id'] ?? $item->employee_id));

        $item->update($validated);
        return $this->ok($item->load('employee:id,first_name,last_name,employee_number'), 'Performance goal updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $item = PerformanceGoal::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $item->delete();
        return $this->ok(null, 'Performance goal deleted successfully');
    }

    private function scopeToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }

    private function assertEmployeeInCompany(Request $request, int $employeeId): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        $allowed = Employee::query()
            ->whereKey($employeeId)
            ->whereHas('user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            })
            ->exists();

        if (!$allowed) {
            abort(403, 'You are not authorized to access this performance goal.');
        }
    }
}
