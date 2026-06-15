<?php

namespace App\Http\Controllers;

use App\Models\EmployeePromotion;
use Illuminate\Http\Request;

class EmployeePromotionController extends Controller
{
    public function index(Request $request, int $employeeId)
    {
        $this->authorizePermission($request, 'employees:view');
        $this->authorizeManagedEmployeeAccess($request, $employeeId, 'employee');

        $items = EmployeePromotion::query()
            ->where('employee_id', $employeeId)
            ->orderByDesc('effective_date')
            ->get();

        return $this->ok($items);
    }

    public function store(Request $request, int $employeeId)
    {
        $this->authorizePermission($request, 'employees:edit');
        $this->authorizeManagedEmployeeAccess($request, $employeeId, 'employee');

        $validated = $request->validate([
            'type'             => 'required|in:promotion,transfer,demotion,grade_change',
            'from_designation' => 'nullable|string|max:200',
            'to_designation'   => 'nullable|string|max:200',
            'from_department'  => 'nullable|string|max:200',
            'to_department'    => 'nullable|string|max:200',
            'from_salary'      => 'nullable|numeric|min:0',
            'to_salary'        => 'nullable|numeric|min:0',
            'effective_date'   => 'required|date',
            'notes'            => 'nullable|string|max:5000',
        ]);

        $item = EmployeePromotion::create([...$validated, 'employee_id' => $employeeId]);

        return $this->ok($item, 'Record added.', 201);
    }

    public function destroy(Request $request, int $employeeId, int $id)
    {
        $this->authorizePermission($request, 'employees:edit');

        $item = EmployeePromotion::where('employee_id', $employeeId)->findOrFail($id);
        $item->delete();

        return $this->ok(null, 'Record deleted.');
    }
}
