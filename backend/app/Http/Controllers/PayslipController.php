<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Payslip;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class PayslipController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $user = $request->user();
        $query = Payslip::with(['employee', 'payroll']);
        $this->scopeToCompany($request, $query, 'employee.user');
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        $ownEmployeeId = $this->ownEmployeeId($user);
        $viewOwnOnly = $this->viewOwnOnly($user);

        if ($request->filled('employee_id')) {
            $employeeId = (int) $request->query('employee_id');
            if ($viewOwnOnly) {
                if ($ownEmployeeId === null) {
                    abort(403, 'You are not authorized to access payslips.');
                }

                $employeeId = $ownEmployeeId;
            }

            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        } elseif ($viewOwnOnly) {
            if ($ownEmployeeId === null) {
                abort(403, 'You are not authorized to access payslips.');
            }

            $query->where('employee_id', $ownEmployeeId);
        }
        if ($request->filled('payroll_id')) {
            $query->where('payroll_id', (int) $request->query('payroll_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'payroll_id' => 'required|exists:payrolls,id',
            'slip_number' => 'required|string|max:100|unique:payslips,slip_number',
            'issue_date' => 'required|date',
            'status' => 'required|in:draft,issued,cancelled',
            'file_url' => 'nullable|string|max:500',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);
        $this->assertPayrollEmployeeMatch((int) $validated['payroll_id'], (int) $validated['employee_id']);

        try {
            $item = Payslip::create($validated);
        } catch (QueryException $e) {
            if ($this->isSlipNumberUniqueError($e)) {
                return $this->fail('Payslip number already exists.', 422, [
                    'slip_number' => ['The slip number has already been taken.'],
                ]);
            }

            throw $e;
        }

        return $this->ok($item->load(['employee', 'payroll']), 'Payslip created successfully', 201);
    }

    public function show(Request $request, int $id)
    {
        $item = Payslip::with(['employee', 'payroll'])->findOrFail($id);
        $this->authorizeRecordAccess($request, (int) $item->employee_id);
        return $this->ok($item);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $item = Payslip::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $validated = $request->validate([
            'status' => 'sometimes|in:draft,issued,cancelled',
            'issue_date' => 'sometimes|date',
            'file_url' => 'nullable|string|max:500',
            'notes' => 'nullable|string|max:1000',
        ]);
        $item->update($validated);
        return $this->ok($item->load(['employee', 'payroll']), 'Payslip updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $item = Payslip::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $item->employee_id);
        $item->delete();
        return $this->ok(null, 'Payslip deleted successfully');
    }

    public function createFromPayroll(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'payroll_id' => 'required|exists:payrolls,id',
            'issue_date' => 'required|date',
        ]);

        $payroll = Payroll::findOrFail((int) $validated['payroll_id']);
        $this->assertPayrollInCompany($request, $payroll);
        $slipNumber = sprintf('PS-%d-%d-%d', $payroll->year, $payroll->month, $payroll->id);

        $item = Payslip::firstOrCreate(
            ['payroll_id' => $payroll->id],
            [
                'employee_id' => $payroll->employee_id,
                'slip_number' => $slipNumber,
                'issue_date' => $validated['issue_date'],
                'status' => 'issued',
            ]
        );

        if (!$item->wasRecentlyCreated && $item->issue_date !== $validated['issue_date']) {
            $item->update(['issue_date' => $validated['issue_date']]);
        }

        return $this->ok($item->load(['employee', 'payroll']), 'Salary slip created successfully');
    }

    private function assertPayrollEmployeeMatch(int $payrollId, int $employeeId): void
    {
        $payrollEmployeeId = (int) Payroll::whereKey($payrollId)->value('employee_id');
        if ($payrollEmployeeId !== $employeeId) {
            abort(422, 'Selected payroll does not belong to the selected employee.');
        }
    }

    private function isSlipNumberUniqueError(QueryException $e): bool
    {
        $message = strtolower($e->getMessage());
        return str_contains($message, 'unique') || str_contains($message, 'payslips_slip_number_unique');
    }

    private function authorizeRead(Request $request): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view') || $request->user()?->can('payroll:view')) {
            return;
        }
        abort(403, 'You are not authorized to access payslips.');
    }

    private function authorizeRecordAccess(Request $request, int $employeeId): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view')) {
            $this->assertEmployeeInCompany($request, $employeeId);
            if ($request->user()?->can('payroll:manage_settings')) {
                $this->authorizeManagedEmployeeAccess($request, $employeeId, 'payslip record');
            }
            return;
        }

        $ownEmployeeId = $this->ownEmployeeId($request->user());
        if ($request->user()?->can('payroll:view') && $ownEmployeeId !== null && (int) $ownEmployeeId === $employeeId) {
            return;
        }
        abort(403, 'You are not authorized to access this payslip.');
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

    private function assertPayrollInCompany(Request $request, Payroll $payroll): void
    {
        $this->assertEmployeeInCompany($request, (int) $payroll->employee_id);
    }
}
