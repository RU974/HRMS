<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\Payslip;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Http\Request;

class PayslipController extends Controller
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
        $query = Payslip::with(['employee', 'payroll']);

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
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->latest()->paginate(15));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'payroll_id' => 'required|exists:payrolls,id',
            'slip_number' => 'required|string|max:100|unique:payslips,slip_number',
            'issue_date' => 'required|date',
            'status' => 'required|in:draft,issued,cancelled',
            'file_url' => 'nullable|string|max:500',
            'notes' => 'nullable|string|max:1000',
        ]);

        $item = Payslip::create($validated);
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
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $item = Payslip::findOrFail($id);
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
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        Payslip::findOrFail($id)->delete();
        return $this->ok(null, 'Payslip deleted successfully');
    }

    public function createFromPayroll(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $validated = $request->validate([
            'payroll_id' => 'required|exists:payrolls,id',
            'issue_date' => 'required|date',
        ]);

        $payroll = Payroll::findOrFail((int) $validated['payroll_id']);
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

        return $this->ok($item->load(['employee', 'payroll']), 'Salary slip created successfully');
    }

    private function authorizeRead(Request $request): void
    {
        $role = $request->user()?->role;
        if (in_array($role, self::MANAGER_ROLES, true) || $role === User::ROLE_EMPLOYEE) {
            return;
        }
        abort(403, 'You are not authorized to access payslips.');
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
        abort(403, 'You are not authorized to access this payslip.');
    }
}

