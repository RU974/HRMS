<?php

namespace App\Http\Controllers;

use App\Models\SalaryGrade;
use Illuminate\Http\Request;

class SalaryGradeController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view|payroll:manage_settings');

        $query = SalaryGrade::orderBy('min_salary');
        $this->scopeToCompanyOrGlobal($request, $query);

        return $this->ok($query->get());
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $validated = $request->validate([
            'name'                => 'required|string|max:120',
            'min_salary'          => 'required|numeric|min:0',
            'max_salary'          => 'required|numeric|gte:min_salary',
            'basic_percent'       => 'nullable|numeric|min:0|max:100',
            'hra_percent'         => 'nullable|numeric|min:0|max:100',
            'transport_allowance' => 'nullable|numeric|min:0',
            'other_allowance'     => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:1000',
        ]);

        $grade = SalaryGrade::create([
            ...$validated,
            'company_id' => $request->user()?->company_id,
        ]);

        return $this->ok($grade, 'Salary grade created.', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $query = SalaryGrade::query();
        $this->scopeToCompany($request, $query);
        $grade = $query->findOrFail($id);

        $validated = $request->validate([
            'name'                => 'sometimes|string|max:120',
            'min_salary'          => 'sometimes|numeric|min:0',
            'max_salary'          => ['sometimes', 'numeric', 'min:0', function ($attr, $value, $fail) use ($request, $grade) {
                $effectiveMin = $request->has('min_salary')
                    ? (float) $request->input('min_salary')
                    : (float) $grade->min_salary;
                if ((float) $value < $effectiveMin) {
                    $fail('The maximum salary must be greater than or equal to the minimum salary.');
                }
            }],
            'basic_percent'       => 'nullable|numeric|min:0|max:100',
            'hra_percent'         => 'nullable|numeric|min:0|max:100',
            'transport_allowance' => 'nullable|numeric|min:0',
            'other_allowance'     => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:1000',
        ]);

        $grade->update($validated);
        return $this->ok($grade, 'Salary grade updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');
        $query = SalaryGrade::query();
        $this->scopeToCompany($request, $query);
        $query->findOrFail($id)->delete();
        return $this->ok(null, 'Salary grade deleted.');
    }
}
