<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PerformanceKpi;
use Illuminate\Http\Request;

class PerformanceKpiController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'view performance');
        $query = PerformanceKpi::query()->with('employee:id,first_name,last_name,employee_number');
        $this->scopeToCompany($request, $query);

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('unit', 'like', "%{$search}%")
                    ->orWhereHas('employee', function ($employeeQuery) use ($search) {
                        $employeeQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('employee_number', 'like', "%{$search}%");
                    });
            });
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage performance');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'name' => 'required|string|max:255',
            'target_value' => 'required|numeric|min:0',
            'current_value' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $item = PerformanceKpi::create([
            ...$validated,
            'current_value' => $validated['current_value'] ?? 0,
            'unit' => $validated['unit'] ?? '%',
        ]);

        return $this->ok($item->load('employee:id,first_name,last_name,employee_number'), 'Performance KPI created successfully', 201);
    }

    public function show(Request $request, $id)
    {
        $this->authorizePermission($request, 'view performance');
        $item = PerformanceKpi::with('employee:id,first_name,last_name,employee_number')->findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        return $this->ok($item);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'edit performance');
        $item = PerformanceKpi::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'name' => 'sometimes|string|max:255',
            'target_value' => 'sometimes|numeric|min:0',
            'current_value' => 'sometimes|numeric|min:0',
            'unit' => 'sometimes|string|max:50',
        ]);
        $this->assertEmployeeInCompany($request, (int) ($validated['employee_id'] ?? $item->employee_id));

        $item->update($validated);
        return $this->ok($item->load('employee:id,first_name,last_name,employee_number'), 'Performance KPI updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage performance');
        $item = PerformanceKpi::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $item->delete();
        return $this->ok(null, 'Performance KPI deleted successfully');
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
            abort(403, 'You are not authorized to access this performance KPI.');
        }
    }
}
