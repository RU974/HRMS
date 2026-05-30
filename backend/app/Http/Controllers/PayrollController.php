<?php

namespace App\Http\Controllers;

use App\Models\Payroll;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Carbon\Carbon;

class PayrollController extends Controller
{
    /**
     * Get all payroll records
     */
    public function index(Request $request)
    {
        $this->authorizeRead($request);
        $query = Payroll::with('employee');
        if (!$request->user()?->can('manage payroll')) {
            $employee = Employee::where('user_id', $request->user()?->id)->firstOrFail();
            $query->where('employee_id', $employee->id);
        }

        if ($request->has('employee_id')) {
            $query->where('employee_id', $request->employee_id);
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
            'status' => 'required|in:pending,processed,paid,cancelled',
        ]);

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

        $validated = $request->validate([
            'bonus' => 'nullable|numeric|min:0',
            'deductions' => 'nullable|numeric|min:0',
            'tax' => 'nullable|numeric|min:0',
            'net_salary' => 'numeric|min:0',
            'payment_date' => 'date',
            'status' => 'in:pending,processed,paid,cancelled',
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
        $payroll->delete();

        return $this->ok(null, 'Payroll record deleted successfully');
    }

    /**
     * Get payroll by employee
     */
    public function getByEmployee($employeeId, Request $request)
    {
        $this->authorizeEmployeeScopedAccess($request, (int) $employeeId);
        $query = Payroll::where('employee_id', $employeeId);

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
            ->where('status', 'active')
            ->get();

        $created = 0;
        $failed = 0;
        $skipped = 0;

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

                Payroll::create([
                    'employee_id' => $employee->id,
                    'month' => $validated['month'],
                    'year' => $validated['year'],
                    'base_salary' => $employee->salary,
                    'bonus' => 0,
                    'deductions' => 0,
                    'tax' => 0,
                    'net_salary' => $employee->salary,
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
            return;
        }

        if ($request->user()?->can('view own payroll')) {
            $employee = Employee::where('user_id', $request->user()?->id)->first();
            if ($employee && (int) $employee->id === $employeeId) {
                return;
            }
        }

        abort(403, 'You are not authorized to access this payroll record.');
    }

    private function authorizePayrollAccess(Request $request, Payroll $payroll): void
    {
        $this->authorizeEmployeeScopedAccess($request, (int) $payroll->employee_id);
    }
}
