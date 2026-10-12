<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\Request;

/**
 * A minimal, company-scoped list of active people for recruitment pickers (interviewer,
 * hiring manager, recruiter, task assignee) that does not require broader employee access.
 */
class RecruitmentDirectoryController extends Controller
{
    public function people(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        $companyId = $request->user()?->company_id;

        $people = Employee::query()
            ->with('department:id,name')
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('status', 'active')
            ->whereNotNull('user_id')
            ->when($request->filled('q'), function ($query) use ($request) {
                $q = trim((string) $request->q);
                $query->where(fn ($inner) => $inner->where('name', 'like', "%{$q}%")->orWhere('email', 'like', "%{$q}%"));
            })
            ->orderBy('name')
            ->limit(min(max((int) $request->input('limit', 50), 1), 100))
            ->get(['id', 'user_id', 'name', 'email', 'designation', 'department_id'])
            ->map(fn (Employee $employee) => [
                'employee_id' => $employee->id,
                'user_id' => $employee->user_id,
                'name' => $employee->name,
                'email' => $employee->email,
                'designation' => $employee->designation,
                'department' => $employee->department?->name,
            ])
            ->values();

        return $this->ok($people);
    }
}
