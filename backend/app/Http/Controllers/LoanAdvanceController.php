<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\LoanAdvance;
use Illuminate\Http\Request;

class LoanAdvanceController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view|payroll:manage_settings');

        $query = LoanAdvance::with('employee:id,name')->orderByDesc('start_date');

        $this->scopeToCompany($request, $query);

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        return $this->ok($query->paginate(20));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'employee_id'         => 'required|exists:employees,id',
            'type'                => 'sometimes|in:loan,advance',
            'title'              => 'required|string|max:200',
            'amount'              => 'required|numeric|min:0',
            'outstanding_balance' => 'nullable|numeric|min:0',
            'emi_amount'          => 'nullable|numeric|min:0',
            'start_date'          => 'required|date',
            'end_date'            => 'nullable|date|after_or_equal:start_date',
            'notes'               => 'nullable|string|max:1000',
        ]);

        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $loan = LoanAdvance::create([
            ...$validated,
            'type'                => $validated['type'] ?? 'loan',
            'outstanding_balance' => $validated['outstanding_balance'] ?? $validated['amount'],
            'company_id'          => $request->user()?->company_id,
            'status'              => 'active',
        ]);

        return $this->ok($loan->load('employee:id,name'), 'Loan/advance created.', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $loan = LoanAdvance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $loan->employee_id);

        $validated = $request->validate([
            'title'               => 'sometimes|string|max:200',
            'outstanding_balance' => 'nullable|numeric|min:0',
            'emi_amount'          => 'nullable|numeric|min:0',
            'end_date'            => 'nullable|date',
            'status'              => 'sometimes|in:active,completed,cancelled',
            'notes'               => 'nullable|string|max:1000',
        ]);

        $loan->update($validated);

        // Auto-complete if balance is zero
        if (isset($validated['outstanding_balance']) && (float) $validated['outstanding_balance'] === 0.0) {
            $loan->update(['status' => 'completed']);
        }

        return $this->ok($loan->load('employee:id,name'), 'Loan/advance updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $loan = LoanAdvance::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $loan->employee_id);
        $loan->delete();
        return $this->ok(null, 'Loan/advance deleted.');
    }

}
