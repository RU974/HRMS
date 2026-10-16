<?php

namespace App\Http\Controllers;

use App\Models\Commission;
use App\Models\Employee;
use App\Models\Payroll;
use Carbon\Carbon;
use Illuminate\Http\Request;

class CommissionController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $query = Commission::with(['employee', 'payroll']);
        $this->scopeToCompany($request, $query, 'employee.user');
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        if ($request->filled('employee_id')) {
            $employeeId = (int) $request->query('employee_id');
            $this->assertEmployeeInCompany($request, $employeeId);
            $query->where('employee_id', $employeeId);
        }

        return $this->ok($query->latest('effective_date')->latest('id')->paginate($this->perPage($request, 15)));
    }

    /**
     * The percentage is always taken from the employee record and the amount is
     * computed here, so the client calculator is only a preview and can never
     * disagree with what is stored.
     */
    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'business_amount' => 'required|numeric|gt:0|max:9999999999',
            'effective_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);
        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);
        $this->authorizeManagedEmployeeAccess($request, (int) $validated['employee_id'], 'commission record');

        $percentage = (float) Employee::whereKey($validated['employee_id'])->value('commission_percentage');
        if ($percentage <= 0) {
            return $this->fail('This employee has no commission percentage set. Set it on the employee profile first.', 422, [
                'employee_id' => ['No commission percentage configured for this employee.'],
            ]);
        }

        // Commissions are picked up when a month's payroll is generated. If that
        // month's payroll already exists it would never be counted, so refuse
        // rather than leave a commission silently stuck as "Pending".
        $date = Carbon::parse($validated['effective_date']);
        if (Payroll::where('employee_id', $validated['employee_id'])->where('month', $date->month)->where('year', $date->year)->exists()) {
            return $this->fail(
                "A payroll record for {$date->format('F Y')} already exists for this employee, so this commission would not be counted. Delete that payroll record first (or add the commission to it by editing the record), or choose a date in another month.",
                422,
                ['effective_date' => ['Payroll already exists for this month.']]
            );
        }

        $commission = Commission::create([
            ...$validated,
            'commission_percentage' => $percentage,
            'commission_amount' => round((float) $validated['business_amount'] * $percentage / 100, 2),
        ]);

        return $this->ok($commission->load(['employee', 'payroll']), 'Commission recorded successfully', 201);
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $commission = Commission::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $commission->employee_id);

        if ($commission->payroll_id !== null) {
            return $this->fail('This commission is already included in a payroll record. Delete that payroll record first.', 422);
        }

        $commission->delete();
        return $this->ok(null, 'Commission deleted successfully');
    }

    private function authorizeRead(Request $request): void
    {
        if ($request->user()?->can('payroll:manage_settings') || $request->user()?->can('payroll:view')) {
            return;
        }
        abort(403, 'You are not authorized to access commissions.');
    }
}
