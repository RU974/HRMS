<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;

class PerformanceMetaController extends Controller
{
    public function employees(Request $request)
    {
        $this->authorizePermission($request, 'performance:view');
        $user = $request->user();
        $query = Employee::query()->select(['id', 'user_id', 'name', 'first_name', 'last_name', 'employee_number']);
        $this->scopeToCompany($request, $query);

        if (!$user?->can('employees:view')) {
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

    private function scopeToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }
}
