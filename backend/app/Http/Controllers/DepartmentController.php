<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    private const MANAGER_ROLES = [
        User::ROLE_SUPER_ADMIN,
        User::ROLE_COMPANY_ADMIN,
        User::ROLE_HR_MANAGER,
        User::ROLE_HR_EXECUTIVE,
    ];

    public function index(Request $request)
    {
        $query = Department::query()->withCount('employees')->orderBy('name');
        if ($request->boolean('include_archived')) {
            $query->withTrashed();
        }

        return $this->ok($query->get());
    }

    public function show($id)
    {
        return $this->ok(Department::with('employees')->findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('departments', 'name')->whereNull('deleted_at')],
        ]);
        return $this->ok(Department::create($validated), 'Department created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $department = Department::findOrFail($id);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('departments', 'name')->ignore($id)->whereNull('deleted_at')],
        ]);
        $department->update($validated);
        return $this->ok($department, 'Department updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        Department::findOrFail($id)->delete();
        return $this->ok(message: 'Department archived successfully');
    }

    public function restore(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $department = Department::withTrashed()->findOrFail($id);
        $department->restore();
        return $this->ok($department, 'Department restored successfully');
    }

    public function reassignEmployees(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $source = Department::findOrFail($id);
        $validated = $request->validate([
            'target_department_id' => 'required|exists:departments,id',
        ]);
        if ((int) $validated['target_department_id'] === (int) $source->id) {
            return $this->fail('Target department must be different from source department.', 422);
        }

        $moved = Employee::where('department_id', $source->id)->update(['department_id' => $validated['target_department_id']]);
        return $this->ok(['moved' => $moved], 'Employees reassigned successfully');
    }

    public function forceDelete(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $department = Department::withTrashed()->findOrFail($id);
        $activeEmployees = Employee::where('department_id', $department->id)->count();
        if ($activeEmployees > 0) {
            return $this->fail('Cannot force delete department with assigned employees. Reassign employees first.', 422, ['employee_count' => $activeEmployees]);
        }

        $department->forceDelete();
        return $this->ok(null, 'Department permanently deleted successfully');
    }
}
