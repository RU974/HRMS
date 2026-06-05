<?php

namespace App\Http\Controllers;

use App\Models\Payroll;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Carbon\Carbon;
use App\Services\PayrollCalculator;

class PayrollController extends Controller
{
    /**
     * Get all payroll records
     */
    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $user = $request->user();
        $query = Payroll::with('employee');
        $this->scopePayrollQueryToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        $ownEmployeeId = $this->ownEmployeeId($user);
        $viewOwnOnly = $this->viewOwnOnly($user);

        if ($request->has('employee_id')) {
            $employeeId = (int) $request->employee_id;
            if ($viewOwnOnly) {
                if ($ownEmployeeId === null) {
                    abort(403, 'You are not authorized to access payroll data.');
                }

                $employeeId = $ownEmployeeId;
            }

            $this->assertEmployeeInActorCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($viewOwnOnly) {
            if ($ownEmployeeId === null) {
                abort(403, 'You are not authorized to access payroll data.');
            }

            $query->where('employee_id', $ownEmployeeId);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('month')) {
            $query->whereMonth('payment_date', $request->month);
        }

        if ($request->has('year')) {
            $query->whereYear('payment_date', $request->year);
        }

        $payrolls = $query->paginate(15);

        return $this->ok($payrolls);
    }

    /**
     * Get single payroll record
     */
    public function show($id)
    {
        $payroll = Payroll::with('employee')->findOrFail($id);
        $this->authorizePayrollAccess(request(), $payroll);

        return $this->ok($payroll);
    }

    /**
     * Create payroll record
     */
    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage payroll');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
            'base_salary' => 'required|numeric|min:0',
            'bonus' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'net_salary' => 'required|numeric|min:0',
            'payment_date' => 'required|date',
            'status' => 'required|in:draft,reviewed,approved,pending,processed,paid,cancelled',
        ]);
        $this->assertEmployeeInActorCompany($request, (int) $validated['employee_id']);

        $payroll = Payroll::create($validated);

        return $this->ok($payroll, 'Payroll record created successfully', 201);
    }

    /**
     * Update payroll record
     */
    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage payroll');
        $payroll = Payroll::findOrFail($id);
        $this->assertPayrollInActorCompany($request, $payroll);

        $validated = $request->validate([
            'bonus' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'net_salary' => 'numeric|min:0',
            'payment_date' => 'date',
            'status' => 'in:draft,reviewed,approved,pending,processed,paid,cancelled',
        ]);

        $payroll->update($validated);

        return $this->ok($payroll, 'Payroll record updated successfully');
    }

    /**
     * Delete payroll record
     */
    public function destroy($id)
    {
        $this->authorizePermission(request(), 'manage payroll');
        $payroll = Payroll::findOrFail($id);
        $this->assertPayrollInActorCompany(request(), $payroll);
        $payroll->delete();

        return $this->ok(null, 'Payroll record deleted successfully');
    }

    /**
     * Get payroll by employee
     */
    public function getByEmployee($employeeId, Request $request)
    {
        $this->authorizeEmployeeScopedAccess($request, (int) $employeeId);
        $this->assertEmployeeInActorCompany($request, (int) $employeeId);
        $query = Payroll::where('employee_id', $employeeId);
        $this->scopePayrollQueryToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        if ($request->has('year')) {
            $query->whereYear('payment_date', $request->year);
        }

        $payrolls = $query->orderBy('payment_date', 'desc')->paginate(12);

        return $this->ok($payrolls);
    }

    /**
     * Generate payroll for employees
     */
    public function generatePayroll(Request $request)
    {
        $this->authorizePermission($request, 'process payroll');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
            'department_id' => 'nullable|exists:departments,id',
        ]);

        $employees = Employee::when($request->has('department_id'), function ($query) use ($validated) {
            return $query->where('department_id', $validated['department_id']);
        })
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->where('status', 'active')
            ->get();

        $created = 0;
        $failed = 0;
        $skipped = 0;

        $calculator = new PayrollCalculator();

        foreach ($employees as $employee) {
            try {
                $alreadyExists = Payroll::where('employee_id', $employee->id)
                    ->where('month', $validated['month'])
                    ->where('year', $validated['year'])
                    ->exists();

                if ($alreadyExists) {
                    $skipped++;
                    continue;
                }

                $calc = $calculator->calculateForEmployee($employee, (int) $validated['month'], (int) $validated['year']);

                Payroll::create([
                    'employee_id' => $employee->id,
                    'month' => $validated['month'],
                    'year' => $validated['year'],
                    'base_salary' => $calc['base_salary'],
                    'bonus' => $calc['bonuses'],
                    'deductions' => $calc['deductions'],
                    'tax' => $calc['tax'],
                    'net_salary' => $calc['net_salary'],
                    'payment_date' => Carbon::createFromDate($validated['year'], $validated['month'], 1)->endOfMonth(),
                    'status' => 'pending',
                ]);
                $created++;
            } catch (\Exception $e) {
                $failed++;
            }
        }

        return $this->ok([
            'created' => $created,
            'skipped' => $skipped,
            'failed' => $failed,
        ], 'Payroll generation completed');
    }

    /**
     * Mark payroll as paid
     */
    public function markAsPaid($id)
    {
        $this->authorizePermission(request(), 'manage payroll');
        $payroll = Payroll::findOrFail($id);
        $this->assertPayrollInActorCompany(request(), $payroll);
        $payroll->update(['status' => 'paid']);

        return $this->ok($payroll, 'Payroll marked as paid');
    }

    /**
     * Get payroll summary for a month
     */
    public function getMonthlySummary(Request $request)
    {
        $this->authorizePermission($request, 'view payroll');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020',
        ]);

        $summary = Payroll::whereMonth('payment_date', $validated['month'])
            ->whereYear('payment_date', $validated['year'])
            ->selectRaw('
                COUNT(*) as total_employees,
                SUM(base_salary) as total_base_salary,
                SUM(bonus) as total_bonus,
                SUM(deductions) as total_deductions,
                SUM(tax) as total_tax,
                SUM(net_salary) as total_net_salary,
                status
            ')
            ->groupBy('status')
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->get();

        return $this->ok($summary);
    }

    private function authorizeRead(Request $request): void
    {
        if ($request->user()?->can('manage payroll') || $request->user()?->can('view payroll') || $request->user()?->can('view own payroll')) {
            return;
        }

        abort(403, 'You are not authorized to access payroll data.');
    }

    private function authorizeEmployeeScopedAccess(Request $request, int $employeeId): void
    {
        if ($request->user()?->can('manage payroll')) {
            $this->authorizeManagedEmployeeAccess($request, $employeeId, 'payroll record');
            return;
        }

        if ($request->user()?->can('view own payroll')) {
            $ownEmployeeId = $this->ownEmployeeId($request->user());
            if ($ownEmployeeId !== null && (int) $ownEmployeeId === $employeeId) {
                return;
            }
        }

        abort(403, 'You are not authorized to access this payroll record.');
    }

    private function authorizePayrollAccess(Request $request, Payroll $payroll): void
    {
        if ($request->user()?->can('manage payroll') || $request->user()?->can('view payroll')) {
            $this->assertPayrollInActorCompany($request, $payroll);
            if ($request->user()?->can('manage payroll')) {
                $this->authorizeManagedEmployeeAccess($request, (int) $payroll->employee_id, 'payroll record');
            }
            return;
        }

        $this->authorizeEmployeeScopedAccess($request, (int) $payroll->employee_id);
        $this->assertPayrollInActorCompany($request, $payroll);
    }

    private function ownEmployeeId(?\App\Models\User $user): ?int
    {
        if (!$user) {
            return null;
        }

        return (int) (Employee::where('user_id', $user->id)->value('id') ?: 0) ?: null;
    }

    private function viewOwnOnly(?\App\Models\User $user): bool
    {
        return (bool) $user?->can('view own payroll')
            && !$user?->can('view payroll')
            && !$user?->can('manage payroll');
    }

    private function scopePayrollQueryToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }

    private function assertEmployeeInActorCompany(Request $request, int $employeeId): void
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
            abort(403, 'You are not authorized to access this payroll record.');
        }
    }

    private function assertPayrollInActorCompany(Request $request, Payroll $payroll): void
    {
        $this->assertEmployeeInActorCompany($request, (int) $payroll->employee_id);
    }
}
