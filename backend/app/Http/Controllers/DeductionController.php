<?php

namespace App\Http\Controllers;

use App\Models\Deduction;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Http\Request;

class DeductionController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $user = $request->user();
        $query = Deduction::with(['employee', 'payroll']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        $ownEmployeeId = $this->ownEmployeeId($user);
        $viewOwnOnly = $this->viewOwnOnly($user);

        if ($request->filled('employee_id')) {
            $employeeId = (int) $request->query('employee_id');
            if ($viewOwnOnly) {
                if ($ownEmployeeId === null) {
                    abort(403, 'You are not authorized to access deductions.');
                }

                $employeeId = $ownEmployeeId;
            }

            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($viewOwnOnly) {
            if ($ownEmployeeId === null) {
                abort(403, 'You are not authorized to access deductions.');
            }

            $query->where('employee_id', $ownEmployeeId);
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
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'payroll_id' => 'nullable|exists:payrolls,id',
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'type' => 'required|in:tax,loan,penalty,provident_fund,pension,esi,professional_tax,other',
            'effective_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);
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
        $this->authorizePermission($request, 'payroll:manage_settings');
        $item = Deduction::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $validated = $request->validate([
            'payroll_id' => 'nullable|exists:payrolls,id',
            'title' => 'sometimes|string|max:255',
            'amount' => 'sometimes|numeric|min:0',
            'type' => 'sometimes|in:tax,loan,penalty,provident_fund,pension,esi,professional_tax,other',
            'effective_date' => 'sometimes|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertEmployeeInCompany($request, (int) ($validated['employee_id'] ?? $item->employee_id));
        $this->assertPayrollEmployeeMatch($validated['payroll_id'] ?? $item->payroll_id, (int) $item->employee_id);
        $item->update($validated);
        return $this->ok($item->load(['employee', 'payroll']), 'Deduction updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $item = Deduction::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $item->delete();
        return $this->ok(null, 'Deduction deleted successfully');
    }

    private function authorizeRead(Request $request): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view') || $request->user()?->can('payroll:view')) {
            return;
        }
        abort(403, 'You are not authorized to access deductions.');
    }

    private function authorizeRecordAccess(Request $request, int $employeeId): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view')) {
            $this->assertEmployeeInCompany($request, $employeeId);
            if ($request->user()?->can('payroll:manage_settings')) {
                $this->authorizeManagedEmployeeAccess($request, $employeeId, 'deduction record');
            }
            return;
        }

        $ownEmployeeId = $this->ownEmployeeId($request->user());
        if ($request->user()?->can('payroll:view') && $ownEmployeeId !== null && (int) $ownEmployeeId === $employeeId) {
            return;
        }
        abort(403, 'You are not authorized to access this deduction.');
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
            abort(403, 'You are not authorized to access this deduction.');
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
