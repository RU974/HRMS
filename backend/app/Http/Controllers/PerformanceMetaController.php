<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PerformanceAppraisal;
use App\Models\PerformanceReview;
use App\Models\User;
use Illuminate\Http\Request;

class PerformanceMetaController extends Controller
{
    public function trend(Request $request, int $employeeId)
    {
        $this->authorizePermission($request, 'performance:view');
        $companyId = $request->user()?->company_id;

        $employeeQuery = Employee::query()->whereKey($employeeId);
        if ($companyId) {
            $employeeQuery->where('company_id', $companyId);
        }
        if (!$employeeQuery->exists()) {
            abort(403, 'You are not authorized to access this employee.');
        }

        $reviews = PerformanceReview::where('employee_id', $employeeId)
            ->orderBy('created_at')
            ->get(['rating as score', 'period as label', 'created_at']);

        $appraisals = PerformanceAppraisal::where('employee_id', $employeeId)
            ->orderBy('created_at')
            ->get(['overall_score as score', 'cycle as label', 'created_at']);

        $timeline = $reviews->map(fn ($item) => [
            'type' => 'review',
            'label' => $item->label,
            'score' => (int) $item->score,
            'date' => $item->created_at?->toDateString(),
        ])->concat($appraisals->map(fn ($item) => [
            'type' => 'appraisal',
            'label' => $item->label,
            'score' => (int) $item->score,
            'date' => $item->created_at?->toDateString(),
        ]))->sortBy('date')->values();

        return $this->ok($timeline);
    }
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
