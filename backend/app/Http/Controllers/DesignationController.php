<?php

namespace App\Http\Controllers;

use App\Models\Designation;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DesignationController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit']);

        $query = Designation::query();
        $this->scopeToCompany($request, $query);
        return $this->ok($query->orderBy('name')->get());
    }

    public function show(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['settings:manage_settings', 'employees:edit']);

        $query = Designation::query();
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
                Rule::unique('designations', 'name')->where('company_id', $companyId),
            ],
        ]);

        $validated['company_id'] = $companyId;

        return $this->ok(Designation::create($validated), 'Designation created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $companyId   = $request->user()->company_id;
        $query       = Designation::query();
        $this->scopeToCompany($request, $query);
        $designation = $query->findOrFail($id);

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('designations', 'name')->ignore($id)->where('company_id', $companyId),
            ],
        ]);

        $designation->update($validated);

        return $this->ok($designation, 'Designation updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'settings:manage_settings');

        $query       = Designation::query();
        $this->scopeToCompany($request, $query);
        $designation = $query->findOrFail($id);
        $inUse       = Employee::where('designation_id', $designation->id)->count();

        if ($inUse > 0) {
            return $this->fail('Designation cannot be deleted because it is assigned to employees.', 422, ['employee_count' => $inUse]);
        }

        $designation->delete();

        return $this->ok(null, 'Designation deleted successfully');
    }
}
