<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TicketStatsController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['tickets:view', 'tickets:create', 'tickets:manage_settings']);

        $user      = $request->user();
        $now       = now();
        $monthStart = $now->copy()->startOfMonth();

        // Base scoped query — HasCompany global scope already filters by company_id
        $base = Ticket::query();

        // Department heads see only their department's tickets
        if (
            $user->hasAnyRole([User::ROLE_DEPARTMENT_MANAGER]) &&
            !$user->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN])
        ) {
            $departmentId = $user->employee?->department_id;
            if ($departmentId) {
                $base->where('department_id', $departmentId);
            }
        }

        $open        = (clone $base)->where('status', 'open')->count();
        $inProgress  = (clone $base)->where('status', 'in_progress')->count();

        $resolvedThisMonth = (clone $base)
            ->where('status', 'resolved')
            ->whereBetween('resolved_at', [$monthStart, $now])
            ->count();

        $closedThisMonth = (clone $base)
            ->where('status', 'closed')
            ->whereBetween('closed_at', [$monthStart, $now])
            ->count();

        $avgResolutionDays = (clone $base)
            ->where('status', 'resolved')
            ->whereNotNull('resolved_at')
            ->selectRaw('AVG(TIMESTAMPDIFF(SECOND, created_at, resolved_at)) / 86400.0 AS avg_days')
            ->value('avg_days');

        $byDepartment = (clone $base)
            ->join('departments', 'tickets.department_id', '=', 'departments.id')
            ->select('departments.name', DB::raw('COUNT(*) as count'))
            ->groupBy('departments.name')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'count' => (int) $r->count])
            ->values();

        $byPriority = (clone $base)
            ->select('priority', DB::raw('COUNT(*) as count'))
            ->groupBy('priority')
            ->get()
            ->map(fn ($r) => ['priority' => $r->priority, 'count' => (int) $r->count])
            ->values();

        // Personal stats are always scoped to the authenticated user regardless of role
        $myOpen = Ticket::query()
            ->where('created_by', $user->id)
            ->whereIn('status', ['open', 'in_progress', 'reopened'])
            ->count();

        $myResolved = Ticket::query()
            ->where('created_by', $user->id)
            ->where('status', 'resolved')
            ->count();

        return $this->ok([
            'open'                 => $open,
            'in_progress'          => $inProgress,
            'resolved_this_month'  => $resolvedThisMonth,
            'closed_this_month'    => $closedThisMonth,
            'avg_resolution_days'  => round((float) ($avgResolutionDays ?? 0), 1),
            'by_department'        => $byDepartment,
            'by_priority'          => $byPriority,
            'my_open'              => $myOpen,
            'my_resolved'          => $myResolved,
        ]);
    }
}
