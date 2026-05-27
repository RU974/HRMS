<?php

namespace App\Http\Controllers;

use App\Models\Bonus;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Http\Request;

class BonusController extends Controller
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
        $query = Bonus::with(['employee', 'payroll']);

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
            'taxable' => 'nullable|boolean',
            'effective_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertPayrollEmployeeMatch($validated['payroll_id'] ?? null, (int) $validated['employee_id']);

        $bonus = Bonus::create($validated);
        return $this->ok($bonus->load(['employee', 'payroll']), 'Bonus created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $bonus = Bonus::with(['employee', 'payroll'])->findOrFail($id);
        $this->authorizeRecordAccess($request, (int) $bonus->employee_id);
        return $this->ok($bonus);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $bonus = Bonus::findOrFail($id);
        $validated = $request->validate([
            'employee_id' => 'sometimes|exists:employees,id',
            'payroll_id' => 'nullable|exists:payrolls,id',
            'title' => 'sometimes|string|max:255',
            'amount' => 'sometimes|numeric|min:0',
            'taxable' => 'nullable|boolean',
            'effective_date' => 'sometimes|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $employeeId = (int) ($validated['employee_id'] ?? $bonus->employee_id);
        $this->assertPayrollEmployeeMatch($validated['payroll_id'] ?? $bonus->payroll_id, $employeeId);

        $bonus->fill($validated);
        $bonus->save();
        return $this->ok($bonus->load(['employee', 'payroll']), 'Bonus updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        Bonus::findOrFail($id)->delete();
        return $this->ok(null, 'Bonus deleted successfully');
    }

    private function authorizeRead(Request $request): void
    {
        $role = $request->user()?->role;
        if (in_array($role, self::MANAGER_ROLES, true) || $role === User::ROLE_EMPLOYEE) {
            return;
        }
        abort(403, 'You are not authorized to access bonuses.');
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
        abort(403, 'You are not authorized to access this bonus.');
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
