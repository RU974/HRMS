<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;

class PerformanceMetaController extends Controller
{
    public function employees(Request $request)
    {
        $this->authorizePermission($request, 'view performance');
        $user = $request->user();
        $query = Employee::query()->select(['id', 'user_id', 'name', 'first_name', 'last_name', 'employee_number']);

        if (!$user?->can('view employees')) {
            $query->where('user_id', $user?->id);
        }

        return $this->ok($query->orderBy('name')->get()->map(function (Employee $employee) {
            return [
                'id' => $employee->id,
                'name' => $employee->name,
                'first_name' => $employee->first_name,
                'last_name' => $employee->last_name,
                'employee_code' => $employee->employee_number,
            ];
        }));
    }
}
