<?php

namespace App\Http\Controllers;

use App\Models\EmployeeBankAccount;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeBankAccountController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $query = EmployeeBankAccount::with('employee:id,name')->orderByDesc('id');
        $this->scopeToCompany($request, $query);

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }

        return $this->ok($query->paginate($this->perPage($request, 20)));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'employee_id'         => ['required', 'exists:employees,id', Rule::unique('employee_bank_accounts', 'employee_id')],
            ...$this->rules(),
        ], ['employee_id.unique' => 'This employee already has bank details. Edit the existing record instead.']);

        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $account = EmployeeBankAccount::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
        ]);

        return $this->ok($account->load('employee:id,name'), 'Bank details saved.', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $account = EmployeeBankAccount::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $account->employee_id);

        $account->update($request->validate($this->rules()));

        return $this->ok($account->load('employee:id,name'), 'Bank details updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $account = EmployeeBankAccount::findOrFail($id);
        $this->assertEmployeeInCompany($request, (int) $account->employee_id);
        $account->delete();

        return $this->ok(null, 'Bank details deleted.');
    }

    private function rules(): array
    {
        return [
            'account_holder_name' => 'required|string|max:200',
            'bank_name'           => 'required|string|max:200',
            'branch_name'         => 'nullable|string|max:200',
            'account_number'      => 'required|string|max:50',
            'iban'                => 'nullable|string|max:50',
            'swift_code'          => 'nullable|string|max:20',
            'routing_code'        => 'nullable|string|max:30',
            'account_type'        => ['required', Rule::in(EmployeeBankAccount::ACCOUNT_TYPES)],
            'notes'               => 'nullable|string|max:1000',
        ];
    }
}
