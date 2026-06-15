<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\SalaryIncrement;
use Illuminate\Http\Request;

class SalaryIncrementController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view|payroll:manage_settings');

        $query = SalaryIncrement::with('employee:id,name')
            ->orderByDesc('effective_date');

        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', fn ($q) => $q->where('company_id', $companyId));
        }

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }

        return $this->ok($query->paginate(20));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'employee_id'    => 'required|exists:employees,id',
            'effective_date' => 'required|date',
            'old_salary'     => 'required|numeric|min:0',
            'new_salary'     => 'required|numeric|min:0',
            'reason'         => 'nullable|string|max:200',
            'notes'          => 'nullable|string|max:1000',
        ]);

        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $increment = SalaryIncrement::create($validated);

        return $this->ok($increment->load('employee:id,name'), 'Salary increment recorded.', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $increment = SalaryIncrement::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $increment->employee_id);

        $validated = $request->validate([
            'effective_date' => 'sometimes|date',
            'old_salary'     => 'sometimes|numeric|min:0',
            'new_salary'     => 'sometimes|numeric|min:0',
            'reason'         => 'nullable|string|max:200',
            'notes'          => 'nullable|string|max:1000',
        ]);

        $increment->update($validated);
        return $this->ok($increment->load('employee:id,name'), 'Salary increment updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $increment = SalaryIncrement::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $increment->employee_id);
        $increment->delete();
        return $this->ok(null, 'Salary increment deleted.');
    }

    private function assertEmployeeInCompany(Request $request, int $employeeId): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) return;

        $exists = Employee::whereKey($employeeId)
            ->whereHas('user', fn ($q) => $q->where('company_id', $companyId))
            ->exists();

        if (!$exists) abort(403, 'Employee not in your company.');
    }
}
