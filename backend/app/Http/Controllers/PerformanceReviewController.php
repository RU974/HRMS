<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PerformanceReview;
use Illuminate\Http\Request;

class PerformanceReviewController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'performance:view');
        $query = PerformanceReview::query()->with(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email']);
        $this->scopeToCompany($request, $query);

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('period', 'like', "%{$search}%")
                    ->orWhere('summary', 'like', "%{$search}%")
                    ->orWhereHas('employee', function ($employeeQuery) use ($search) {
                        $employeeQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('employee_number', 'like', "%{$search}%");
                    });
            });
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
            'period' => 'required|string|max:100',
            'rating' => 'required|integer|min:1|max:5',
            'template_id' => 'nullable|exists:performance_review_templates,id',
            'summary' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $item = PerformanceReview::create([
            ...$validated,
            'reviewer_id' => $validated['reviewer_id'] ?? $request->user()?->id,
        ]);

        return $this->ok($item->load(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email']), 'Performance review created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:view');
        $item = PerformanceReview::with(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email'])->findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        return $this->ok($item);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:edit');
        $item = PerformanceReview::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'period' => 'sometimes|string|max:100',
            'rating' => 'sometimes|integer|min:1|max:5',
            'template_id' => 'nullable|exists:performance_review_templates,id',
            'summary' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);
        $this->assertEmployeeInCompany($request, (int) ($validated['employee_id'] ?? $item->employee_id));

        $item->update($validated);
        return $this->ok($item->load(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email']), 'Performance review updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $item = PerformanceReview::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $item->delete();
        return $this->ok(null, 'Performance review deleted successfully');
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
            abort(403, 'You are not authorized to access this performance review.');
        }
    }
}
