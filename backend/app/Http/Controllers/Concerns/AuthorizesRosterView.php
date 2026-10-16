<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\Request;

trait AuthorizesRosterView
{
    /**
     * Reading other people's rosters is for whoever schedules or reviews attendance, and for line
     * managers (their team only; the managed-employee scope narrows the rows). A plain employee
     * has attendance:view for their own records, which does not open the whole department's rota.
     */
    protected function authorizeRosterView(Request $request): void
    {
        $user = $request->user();
        if ($this->userIsCompanyAdmin($request)
            || $user?->can('attendance:edit') || $user?->can('attendance:manage_settings') || $user?->can('attendance:approve')) {
            return;
        }

        $employeeId = $user?->employee?->id;
        if ($employeeId && ($user->can('attendance:view') || $user->can('leaves:approve'))
            && ($user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER])
                || Employee::withoutGlobalScopes()->where('manager_id', $employeeId)->exists())) {
            return;
        }

        abort(403, 'You are not authorized to view rosters.');
    }
}
