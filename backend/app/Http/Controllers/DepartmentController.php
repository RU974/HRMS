<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit', 'recruitment:view']);

        $query = Department::query()->withCount('employees')->orderBy('name');
        $this->scopeToCompany($request, $query);
        if ($request->boolean('include_archived')) {
            $query->withTrashed();
        }

        return $this->ok($query->get());
    }

    public function show(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit', 'recruitment:view']);

        $query = Department::query()->with('employees');
        $this->scopeToCompany($request, $query);
        return $this->ok($query->findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $companyId = $request->user()->company_id;

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('departments', 'name')
                    ->where('company_id', $companyId)
                    ->whereNull('deleted_at'),
            ],
        ]);

        $validated['company_id'] = $companyId;

        return $this->ok(Department::create($validated), 'Department created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $companyId  = $request->user()->company_id;
        $query      = Department::query();
        $this->scopeToCompany($request, $query);
        $department = $query->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('departments', 'name')
                    ->ignore($id)
                    ->where('company_id', $companyId)
                    ->whereNull('deleted_at'),
            ],
        ]);

        $department->update($validated);

        return $this->ok($department, 'Department updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $query = Department::query();
        $this->scopeToCompany($request, $query);
        $query->findOrFail($id)->delete();
        return $this->ok(message: 'Department archived successfully');
    }

    public function restore(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');
        $query      = Department::query();
        $this->scopeToCompany($request, $query);
        $department = $query->withTrashed()->findOrFail($id);
        $department->restore();
        return $this->ok($department, 'Department restored successfully');
    }

    public function reassignEmployees(Request $request, $id)
    {
        $this->authorizePermission($request, 'employees:edit');

        $source = Department::findOrFail($id);

        $companyId = $request->user()->company_id;
        $existsRule = Rule::exists('departments', 'id');
        if ($companyId) {
            $existsRule->where('company_id', $companyId);
        }

        $validated = $request->validate([
            'target_department_id' => ['required', $existsRule],
        ]);

        if ((int) $validated['target_department_id'] === (int) $source->id) {
            return $this->fail('Target department must be different from source department.', 422);
        }

        $moved = Employee::where('department_id', $source->id)->update(['department_id' => $validated['target_department_id']]);

        return $this->ok(['moved' => $moved], 'Employees reassigned successfully');
    }

    public function forceDelete(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $query      = Department::query();
        $this->scopeToCompany($request, $query);
        $department = $query->withTrashed()->findOrFail($id);
        $activeEmployees = Employee::where('department_id', $department->id)->count();

        if ($activeEmployees > 0) {
            return $this->fail('Cannot force delete department with assigned employees. Reassign employees first.', 422, ['employee_count' => $activeEmployees]);
        }

        $department->forceDelete();

        return $this->ok(null, 'Department permanently deleted successfully');
    }
}
