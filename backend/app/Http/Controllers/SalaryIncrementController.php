<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\SalaryIncrement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SalaryIncrementController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view|payroll:manage_settings');

        $query = SalaryIncrement::with('employee:id,name')
            ->orderByDesc('effective_date');

        $this->scopeToCompany($request, $query, 'employee');

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }

        return $this->ok($query->paginate($this->perPage($request, 20)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'employee_id'    => 'required|exists:employees,id',
            'appraisal_id'   => 'nullable|exists:performance_appraisals,id',
            'effective_date' => 'required|date',
            'old_salary'     => 'required|numeric|min:0',
            'new_salary'     => 'required|numeric|min:0',
            'reason'         => 'nullable|string|max:200',
            'notes'          => 'nullable|string|max:1000',
        ]);

        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $increment = DB::transaction(function () use ($validated) {
            $increment = SalaryIncrement::create($validated);

            // Recording an increment used to be a pure log entry with no effect on
            // pay — the employee's basic_salary never actually changed, so payroll
            // generation kept using the pre-increment figure. Only apply it if this
            // is the most recent increment on record, so backdating an older
            // correction doesn't clobber a newer increment already applied.
            $latestEffectiveDate = SalaryIncrement::where('employee_id', $increment->employee_id)
                ->max('effective_date');

            if ($increment->effective_date >= $latestEffectiveDate) {
                $employee = Employee::find($increment->employee_id);
                if ($employee) {
                    $employee->basic_salary = $validated['new_salary'];
                    $employee->salary = (float) $validated['new_salary'] + (float) ($employee->allowances ?? 0);
                    $employee->save();
                }
            }

            return $increment;
        });

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

}
