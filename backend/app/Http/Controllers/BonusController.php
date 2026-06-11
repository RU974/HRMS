<?php

namespace App\Http\Controllers;

use App\Models\Bonus;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Http\Request;

class BonusController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $user = $request->user();
        $query = Bonus::with(['employee', 'payroll']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        $ownEmployeeId = $this->ownEmployeeId($user);
        $viewOwnOnly = $this->viewOwnOnly($user);

        if ($request->filled('employee_id')) {
            $employeeId = (int) $request->query('employee_id');
            if ($viewOwnOnly) {
                if ($ownEmployeeId === null) {
                    abort(403, 'You are not authorized to access bonuses.');
                }

                $employeeId = $ownEmployeeId;
            }

            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($viewOwnOnly) {
            if ($ownEmployeeId === null) {
                abort(403, 'You are not authorized to access bonuses.');
            }

            $query->where('employee_id', $ownEmployeeId);
        }
        if ($request->filled('payroll_id')) {
            $query->where('payroll_id', (int) $request->query('payroll_id'));
        }

        return $this->ok($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'payroll_id' => 'nullable|exists:payrolls,id',
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'taxable' => 'nullable|boolean',
            'effective_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);
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
        $this->authorizePermission($request, 'payroll:manage_settings');
        $bonus = Bonus::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $bonus->employee_id);
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
        $this->assertEmployeeInCompany($request, $employeeId);
        $this->assertPayrollEmployeeMatch($validated['payroll_id'] ?? $bonus->payroll_id, $employeeId);

        $bonus->fill($validated);
        $bonus->save();
        return $this->ok($bonus->load(['employee', 'payroll']), 'Bonus updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $bonus = Bonus::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $bonus->employee_id);
        $bonus->delete();
        return $this->ok(null, 'Bonus deleted successfully');
    }

    private function authorizeRead(Request $request): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view') || $request->user()?->can('payroll:view')) {
            return;
        }
        abort(403, 'You are not authorized to access bonuses.');
    }

    private function authorizeRecordAccess(Request $request, int $employeeId): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view')) {
            $this->assertEmployeeInCompany($request, $employeeId);
            if ($request->user()?->can('payroll:manage_settings')) {
                $this->authorizeManagedEmployeeAccess($request, $employeeId, 'bonus record');
            }
            return;
        }

        $ownEmployeeId = $this->ownEmployeeId($request->user());
        if ($request->user()?->can('payroll:view') && $ownEmployeeId !== null && (int) $ownEmployeeId === $employeeId) {
            return;
        }
        abort(403, 'You are not authorized to access this bonus.');
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

    private function ownEmployeeId(?User $user): ?int
    {
        if (!$user) {
            return null;
        }

        $employeeId = Employee::where('user_id', $user->id)->value('id');
        return $employeeId ? (int) $employeeId : null;
    }

    private function viewOwnOnly(?User $user): bool
    {
        return (bool) $user?->can('payroll:view')
            && !$user?->can('payroll:view')
            && !$user?->can('payroll:manage_settings');
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
            abort(403, 'You are not authorized to access this bonus.');
        }
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
