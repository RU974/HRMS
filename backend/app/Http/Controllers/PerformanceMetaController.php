<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;

class PerformanceMetaController extends Controller
{
    public function employees(Request $request)
    {
        $user = $request->user();
        $query = Employee::query()->select(['id', 'user_id', 'name', 'first_name', 'last_name', 'employee_number']);

        $managerRoles = [
            User::ROLE_SUPER_ADMIN,
            User::ROLE_COMPANY_ADMIN,
            User::ROLE_HR_MANAGER,
            User::ROLE_HR_EXECUTIVE,
            User::ROLE_DEPARTMENT_MANAGER,
        ];

        if (!in_array($user?->role, $managerRoles, true)) {
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

