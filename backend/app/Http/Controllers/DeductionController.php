<?php

namespace App\Http\Controllers;

use App\Models\Deduction;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Http\Request;

class DeductionController extends Controller
{
    private const MANAGER_ROLES = [
        User::ROLE_SUPER_ADMIN,
        User::ROLE_COMPANY_ADMIN,
        User::ROLE_HR_MANAGER,
        User::ROLE_HR_EXECUTIVE,
        User::ROLE_PAYROLL_MANAGER,
    ];

    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $query = Deduction::with(['employee', 'payroll']);

        if ($request->user()?->role === User::ROLE_EMPLOYEE) {
            $employee = Employee::where('user_id', $request->user()?->id)->firstOrFail();
            $query->where('employee_id', $employee->id);
        }
        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }
        if ($request->filled('payroll_id')) {
            $query->where('payroll_id', (int) $request->query('payroll_id'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        return $this->ok($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'payroll_id' => 'nullable|exists:payrolls,id',
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'type' => 'required|in:tax,loan,penalty,other',
            'effective_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertPayrollEmployeeMatch($validated['payroll_id'] ?? null, (int) $validated['employee_id']);

        $item = Deduction::create($validated);
        return $this->ok($item->load(['employee', 'payroll']), 'Deduction created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $item = Deduction::with(['employee', 'payroll'])->findOrFail($id);
        $this->authorizeRecordAccess($request, (int) $item->employee_id);
        return $this->ok($item);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $item = Deduction::findOrFail($id);
        $validated = $request->validate([
            'payroll_id' => 'nullable|exists:payrolls,id',
            'title' => 'sometimes|string|max:255',
            'amount' => 'sometimes|numeric|min:0',
            'type' => 'sometimes|in:tax,loan,penalty,other',
            'effective_date' => 'sometimes|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertPayrollEmployeeMatch($validated['payroll_id'] ?? $item->payroll_id, (int) $item->employee_id);
        $item->update($validated);
        return $this->ok($item->load(['employee', 'payroll']), 'Deduction updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        Deduction::findOrFail($id)->delete();
        return $this->ok(null, 'Deduction deleted successfully');
    }

    private function authorizeRead(Request $request): void
    {
        $role = $request->user()?->role;
        if (in_array($role, self::MANAGER_ROLES, true) || $role === User::ROLE_EMPLOYEE) {
            return;
        }
        abort(403, 'You are not authorized to access deductions.');
    }

    private function authorizeRecordAccess(Request $request, int $employeeId): void
    {
        if (in_array($request->user()?->role, self::MANAGER_ROLES, true)) {
            return;
        }
        $employee = Employee::where('user_id', $request->user()?->id)->first();
        if ($request->user()?->role === User::ROLE_EMPLOYEE && $employee && (int) $employee->id === $employeeId) {
            return;
        }
        abort(403, 'You are not authorized to access this deduction.');
    }

    private function assertPayrollEmployeeMatch(?int $payrollId, int $employeeId): void
    {
        if ($payrollId === null) {
            return;
        }

        $payrollEmployeeId = (int) Payroll::whereKey($payrollId)->value('employee_id');
        if ($payrollEmployeeId !== $employeeId) {
            abort(422, 'Selected payroll does not belong to the selected employee.');
        }
    }
}
