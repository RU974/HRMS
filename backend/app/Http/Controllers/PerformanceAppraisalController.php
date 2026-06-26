<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PerformanceAppraisal;
use Illuminate\Http\Request;

class PerformanceAppraisalController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'performance:view');
        $query = PerformanceAppraisal::query()->with(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email', 'template']);
        $this->scopeToCompany($request, $query, 'employee.user');

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('cycle', 'like', "%{$search}%")
                    ->orWhere('strengths', 'like', "%{$search}%")
                    ->orWhere('improvements', 'like', "%{$search}%")
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

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'cycle' => 'required|string|max:100',
            'overall_score' => 'required|integer|min:1|max:5',
            'status' => 'nullable|in:draft,submitted,approved',
            'template_id' => 'nullable|exists:performance_review_templates,id',
            'strengths' => 'nullable|string|max:10000',
            'improvements' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $item = PerformanceAppraisal::create([
            ...$validated,
            'status' => $validated['status'] ?? 'draft',
            'reviewer_id' => $validated['reviewer_id'] ?? $request->user()?->id,
        ]);

        return $this->ok($item->load(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email', 'template']), 'Performance appraisal created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:view');
        $item = PerformanceAppraisal::with(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email', 'template'])->findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        return $this->ok($item);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:edit');
        $item = PerformanceAppraisal::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'cycle' => 'sometimes|string|max:100',
            'overall_score' => 'sometimes|integer|min:1|max:5',
            'status' => 'sometimes|in:draft,submitted,approved',
            'template_id' => 'nullable|exists:performance_review_templates,id',
            'strengths' => 'nullable|string|max:10000',
            'improvements' => 'nullable|string|max:10000',
            'reviewer_id' => 'nullable|exists:users,id',
        ]);
        $this->assertEmployeeInCompany($request, (int) ($validated['employee_id'] ?? $item->employee_id));

        $item->update($validated);
        return $this->ok($item->load(['employee:id,first_name,last_name,employee_number', 'reviewer:id,name,email', 'template']), 'Performance appraisal updated successfully');
    }

    public function bulkApprove(Request $request)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:performance_appraisals,id',
        ]);

        $query = PerformanceAppraisal::query()->whereIn('id', $validated['ids']);
        $this->scopeToCompany($request, $query, 'employee.user');
        $count = $query->update(['status' => 'approved']);

        return $this->ok(['approved' => $count], "{$count} appraisal(s) approved.");
    }

    public function export(Request $request)
    {
        $this->authorizePermission($request, 'performance:view');
        $query = PerformanceAppraisal::query()->with('employee:id,first_name,last_name,employee_number,name');
        $this->scopeToCompany($request, $query, 'employee.user');

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $rows = $query->latest()->get();

        $csv = "Employee,Employee Number,Cycle,Overall Score,Status,Strengths,Improvements,Created At\n";
        foreach ($rows as $row) {
            $employee = $row->employee;
            $name = trim((string) ($employee?->first_name ?? $employee?->name) . ' ' . (string) ($employee?->last_name ?? ''));
            $fields = [
                $name,
                $employee?->employee_number,
                $row->cycle,
                $row->overall_score,
                $row->status,
                $row->strengths,
                $row->improvements,
                $row->created_at?->toDateString(),
            ];
            $csv .= implode(',', array_map(function ($value) {
                $value = (string) ($value ?? '');
                return '"' . str_replace('"', '""', $value) . '"';
            }, $fields)) . "\n";
        }

        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="performance-appraisals.csv"',
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'performance:manage_settings');
        $item = PerformanceAppraisal::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $item->delete();
        return $this->ok(null, 'Performance appraisal deleted successfully');
    }

}