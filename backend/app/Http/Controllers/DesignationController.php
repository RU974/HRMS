<?php

namespace App\Http\Controllers;

use App\Models\Designation;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;

class DesignationController extends Controller
{
    private const MANAGER_ROLES = [
        User::ROLE_SUPER_ADMIN,
        User::ROLE_COMPANY_ADMIN,
        User::ROLE_HR_MANAGER,
        User::ROLE_HR_EXECUTIVE,
    ];

    public function index()
    {
        return $this->ok(Designation::orderBy('name')->get());
    }

    public function show($id)
    {
        return $this->ok(Designation::findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $validated = $request->validate(['name' => 'required|string|max:255|unique:designations,name']);
        return $this->ok(Designation::create($validated), 'Designation created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $designation = Designation::findOrFail($id);
        $validated = $request->validate(['name' => 'required|string|max:255|unique:designations,name,' . $id]);
        $designation->update($validated);
        return $this->ok($designation, 'Designation updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizeRoles($request, self::MANAGER_ROLES);
        $designation = Designation::findOrFail($id);
        $inUse = Employee::where('designation_id', $designation->id)->count();
        if ($inUse > 0) {
            return $this->fail('Designation cannot be deleted because it is assigned to employees.', 422, ['employee_count' => $inUse]);
        }

        $designation->delete();
        return $this->ok(null, 'Designation deleted successfully');
    }
}
