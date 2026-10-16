<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\LeaveType;
use App\Models\NotificationItem;
use App\Models\Payroll;
use App\Models\PerformanceAppraisal;
use App\Models\PerformanceGoal;
use App\Models\PerformanceKpi;
use App\Models\Payslip;
use App\Models\User;
use App\Services\LeavePolicyService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function workspace(Request $request)
    {
        $user = $request->user()->loadMissing(['roles.permissions', 'permissions', 'employee.department', 'employee.shift', 'employee.manager']);
        $employee = $user->employee;
        $today = Carbon::today();
        $roleKey = $this->resolveRoleKey($user);

        if (!$employee) {
            return $this->ok([
                'role_key' => $roleKey,
                'role_name' => $this->resolveRoleName($user),
                'employee' => null,
                'attendance' => [
                    'today' => null,
                    'recent' => [],
                ],
                'leave' => [
                    'balances' => [],
                    'recent_requests' => [],
                ],
                'payroll' => [
                    'latest_payslip' => null,
                ],
                'calendar' => [
                    'upcoming_holidays' => [],
                ],
                'announcements' => [],
                'notifications' => [],
                'tasks' => [],
            ]);
        }

        $todayAttendance = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereDate('date', $today)
            ->first();

        $recentAttendance = Attendance::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('date')
            ->limit(7)
            ->get()
            ->map(fn (Attendance $attendance) => [
                'date' => Carbon::parse($attendance->date)->toDateString(),
                'status' => $attendance->status,
                'check_in' => $attendance->check_in,
                'check_out' => $attendance->check_out,
            ])
            ->values();

        $leaveBreakdown = $this->buildLeaveBreakdown($employee->id);
        $recentLeaves = Leave::query()
            ->where('employee_id', $employee->id)
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (Leave $leave) => [
                'id' => $leave->id,
                'type' => $leave->type,
                'from_date' => Carbon::parse($leave->from_date)->toDateString(),
                'to_date' => Carbon::parse($leave->to_date)->toDateString(),
                'status' => $leave->status,
            ])
            ->values();

        $latestPayslip = Payslip::query()
            ->with(['payroll'])
            ->where('employee_id', $employee->id)
            ->latest('issue_date')
            ->first();

        $holidayQuery = Holiday::query()->whereDate('holiday_date', '>=', $today)->orderBy('holiday_date')->limit(5);
        $this->scopeToCompany($request, $holidayQuery);
        $upcomingHolidays = $holidayQuery->get()
            ->map(fn (Holiday $holiday) => [
                'id' => $holiday->id,
                'name' => $holiday->name,
                'date' => $holiday->holiday_date?->toDateString() ?? (string) $holiday->holiday_date,
                'is_optional' => $holiday->is_optional,
            ])
            ->values();

        $announcementQuery = Announcement::query()->where('is_published', true);
        $this->scopeToCompany($request, $announcementQuery);
        $announcements = $announcementQuery
            ->latest('published_at')
            ->get()
            ->filter(fn (Announcement $announcement) => $this->announcementVisibleToUser($announcement, $user))
            ->take(5)
            ->map(fn (Announcement $announcement) => [
                'id' => $announcement->id,
                'title' => $announcement->title,
                'body' => $announcement->body,
                'target' => $announcement->target,
                'published_at' => $announcement->published_at?->toDateString() ?? (string) $announcement->published_at,
            ])
            ->values();

        $notifications = NotificationItem::query()
            ->where('user_id', $user->id)
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn (NotificationItem $item) => [
                'id' => $item->id,
                'title' => $item->title,
                'message' => $item->message,
                'type' => $item->type,
                'is_read' => $item->is_read,
                'created_at' => $item->created_at?->toDateTimeString() ?? (string) $item->created_at,
            ])
            ->values();

        return $this->ok([
            'role_key' => $roleKey,
            'role_name' => $this->resolveRoleName($user),
            'employee' => [
                'id' => $employee->id,
                'employee_number' => $employee->employee_number,
                'name' => $employee->name,
                'email' => $employee->email,
                'joining_date' => $employee->joining_date ? Carbon::parse($employee->joining_date)->toDateString() : null,
                'status' => $employee->status,
                'department' => $employee->department?->only(['id', 'name']),
                'designation' => $employee->designationRef?->only(['id', 'name']),
                // Today's shift (roster, rotation, swap or override before the default), not just the default.
                'shift' => $employee->scheduleOn(today())->shift?->only(['id', 'name']),
                'manager' => $employee->manager?->only(['id', 'name']),
            ],
            'attendance' => [
                'today' => $todayAttendance ? [
                    'id' => $todayAttendance->id,
                    'date' => Carbon::parse($todayAttendance->date)->toDateString(),
                    'status' => $todayAttendance->status,
                    'check_in' => $todayAttendance->check_in,
                    'check_out' => $todayAttendance->check_out,
                ] : null,
                'recent' => $recentAttendance,
            ],
            'leave' => [
                'balances' => $leaveBreakdown,
                'recent_requests' => $recentLeaves,
            ],
            'payroll' => [
                'latest_payslip' => $latestPayslip ? [
                    'id' => $latestPayslip->id,
                    'slip_number' => $latestPayslip->slip_number,
                    'status' => $latestPayslip->status,
                    'issue_date' => Carbon::parse($latestPayslip->issue_date)->toDateString(),
                    'file_url' => $latestPayslip->file_url,
                    'notes' => $latestPayslip->notes,
                    'payroll' => $latestPayslip->payroll ? [
                        'id' => $latestPayslip->payroll->id,
                        'month' => $latestPayslip->payroll->month,
                        'year' => $latestPayslip->payroll->year,
                        'net_salary' => $latestPayslip->payroll->net_salary,
                        'payment_date' => $latestPayslip->payroll->payment_date ? Carbon::parse($latestPayslip->payroll->payment_date)->toDateString() : null,
                    ] : null,
                ] : null,
            ],
            'calendar' => [
                'upcoming_holidays' => $upcomingHolidays,
            ],
            'announcements' => $announcements,
            'notifications' => $notifications,
            'tasks' => $notifications->map(fn (array $notification) => [
                'id' => $notification['id'],
                'title' => $notification['title'],
                'details' => $notification['message'],
                'status' => $notification['is_read'] ? 'completed' : 'open',
            ])->values(),
        ]);
    }

    public function summary(Request $request)
    {
        $validated = $request->validate([
            'month' => 'sometimes|integer|min:1|max:12',
            'year' => 'sometimes|integer|min:2000',
        ]);

        $today = Carbon::today();
        $month = $validated['month'] ?? $today->month;
        $year = $validated['year'] ?? $today->year;
        $companyId = $request->user()?->company_id;

        $employeeQuery  = Employee::query();
        $attendanceQuery = Attendance::query();
        $leaveQuery     = Leave::query();
        $payrollQuery   = Payroll::query();

        $this->scopeToCompany($request, $employeeQuery);
        $this->scopeToCompany($request, $attendanceQuery, 'employee.user');
        $this->scopeToCompany($request, $leaveQuery, 'employee.user');
        $this->scopeToCompany($request, $payrollQuery, 'employee.user');

        $this->applyManagedEmployeeScope($request, $employeeQuery);
        $this->applyManagedEmployeeScope($request, $attendanceQuery, 'employee');
        $this->applyManagedEmployeeScope($request, $leaveQuery, 'employee');
        $this->applyManagedEmployeeScope($request, $payrollQuery, 'employee');

        // Dashboard headcount only counts active employees.
        $activeEmployees = (clone $employeeQuery)->where('status', 'active')->count();
        $employees = $activeEmployees;
        $todayAttendance = (clone $attendanceQuery)->whereDate('date', $today)->count();
        $todayPresent = (clone $attendanceQuery)->whereDate('date', $today)->whereIn('status', ['present', 'late', 'half_day', 'missing_check_in', 'missing_check_out'])->count();
        $pendingLeaves = (clone $leaveQuery)->where('status', 'pending')->count();
        $pendingPayrolls = (clone $payrollQuery)->where('status', 'pending')->count();

        $attendanceRate = $todayAttendance > 0 ? round(($todayPresent / $todayAttendance) * 100, 2) : 0;
        $monthlyPayroll = (clone $payrollQuery)->whereMonth('payment_date', $month)->whereYear('payment_date', $year)->sum('net_salary');

        return $this->ok([
            'employees' => $employees,
            'active_employees' => $activeEmployees,
            'attendance_rate' => $attendanceRate,
            'pending_leaves' => $pendingLeaves,
            'pending_payrolls' => $pendingPayrolls,
            'monthly_payroll' => (float) $monthlyPayroll,
            'month' => $month,
            'year' => $year,
        ]);
    }

    public function insights(Request $request)
    {
        $today = Carbon::today();
        $last7Start = $today->copy()->subDays(6);
        $user = $request->user();
        $companyId = $user?->company_id;
        if (!$companyId && $user && !$user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            abort(403, 'Your account is not associated with a company.');
        }

        $attendanceRows = Attendance::select('date', DB::raw('COUNT(*) as total'), DB::raw("SUM(CASE WHEN status IN ('present', 'late', 'half_day', 'missing_check_in', 'missing_check_out') THEN 1 ELSE 0 END) as present_count"));
        $this->scopeToCompany($request, $attendanceRows, 'employee.user');
        $this->applyManagedEmployeeScope($request, $attendanceRows, 'employee');

        $attendanceRows = $attendanceRows
            ->whereBetween('date', [$last7Start->toDateString(), $today->toDateString()])
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy(fn ($row) => Carbon::parse($row->date)->toDateString());

        $attendanceTrend = collect(range(0, 6))->map(function (int $offset) use ($last7Start, $attendanceRows) {
            $date = $last7Start->copy()->addDays($offset);
            $key = $date->toDateString();
            $row = $attendanceRows->get($key);
            $total = (int) ($row->total ?? 0);
            $present = (int) ($row->present_count ?? 0);
            $rate = $total > 0 ? round(($present / $total) * 100, 2) : 0;

            return [
                'date' => $key,
                'label' => $date->format('D'),
                'rate' => $rate,
            ];
        })->values();

        $departmentDistribution = Department::query()
            ->select('departments.id', 'departments.name', DB::raw('COUNT(employees.id) as employee_count'))
            ->leftJoin('employees', function ($join): void {
                $join->on('employees.department_id', '=', 'departments.id')
                    ->where('employees.status', 'active');
            })
            ->leftJoin('users', 'users.id', '=', 'employees.user_id')
            ->when($companyId, function ($query) use ($companyId): void {
                $query->where('users.company_id', $companyId);
            })
            ->groupBy('departments.id', 'departments.name')
            ->orderByDesc('employee_count')
            ->limit(6)
            ->get()
            ->map(fn ($row) => [
                'label' => $row->name ?? 'Unassigned',
                'value' => (int) $row->employee_count,
            ])
            ->values();

        $leaveQuery = Leave::query();
        $this->scopeToCompany($request, $leaveQuery, 'employee.user');
        $leaveBreakdown = $leaveQuery
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->get()
            ->map(fn ($row) => [
                'label' => ucfirst((string) $row->status),
                'value' => (int) $row->total,
            ])
            ->values();

        $recentEmployeesQuery = Employee::query()->with('department:id,name')->where('status', 'active');
        $this->scopeToCompany($request, $recentEmployeesQuery, 'user');
        $recentEmployees = $recentEmployeesQuery
            ->orderByDesc('created_at')
            ->limit(6)
            ->get(['id', 'employee_number', 'name', 'status', 'department_id', 'created_at'])
            ->map(fn (Employee $employee) => [
                'id' => $employee->id,
                'employee_number' => $employee->employee_number ?: 'EMP-' . str_pad((string) $employee->id, 4, '0', STR_PAD_LEFT),
                'name' => $employee->name,
                'status' => ucfirst((string) $employee->status),
                'department' => $employee->department?->name ?? 'Unassigned',
                'joined_at' => optional($employee->created_at)?->toDateString(),
            ])
            ->values();

        $monthlyPayrollTrend = $this->getMonthlyPayrollTrend($companyId, $request);
        $headcountTrend      = $this->getHeadcountTrend($companyId, $request);
        $performanceSummary  = $this->getPerformanceSummary($request);
        $attritionRisk       = $this->getAttritionRisk($companyId);

        return $this->ok([
            'as_of_date' => $today->toDateString(),
            'attendance_trend' => $attendanceTrend,
            'department_distribution' => $departmentDistribution,
            'leave_breakdown' => $leaveBreakdown,
            'recent_employees' => $recentEmployees,
            'monthly_payroll_trend' => $monthlyPayrollTrend,
            'headcount_trend' => $headcountTrend,
            'performance_summary' => $performanceSummary,
            'attrition_risk' => $attritionRisk,
        ]);
    }

    private function resolveRoleName(?User $user): string
    {
        return (string) ($user?->roles->first()?->name ?? User::ROLE_EMPLOYEE);
    }

    private function resolveRoleKey(?User $user): string
    {
        $roleName = $this->resolveRoleName($user);
        $map = [
            User::ROLE_SUPER_ADMIN => 'super_admin',
            User::ROLE_COMPANY_ADMIN => 'company_admin',
            User::ROLE_HR_MANAGER => 'hr_manager',
            User::ROLE_HR_EXECUTIVE => 'hr_executive',
            User::ROLE_PAYROLL_MANAGER => 'payroll_manager',
            User::ROLE_ATTENDANCE_MANAGER => 'attendance_manager',
            User::ROLE_RECRUITER => 'recruiter',
            User::ROLE_DEPARTMENT_MANAGER => 'department_manager',
            User::ROLE_IT_SUPPORT => 'it_support',
            User::ROLE_EMPLOYEE => 'employee',
        ];

        return $map[$roleName] ?? str_replace(' ', '_', strtolower($roleName));
    }

    /**
     * @return array<int, array{id:int,name:string,default_days:int,used_days:int,remaining_days:int,is_paid:bool}>
     */
    private function buildLeaveBreakdown(int $employeeId): array
    {
        $employee = Employee::find($employeeId);
        $policyService = new LeavePolicyService();
        $today = Carbon::today();

        return LeaveType::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(function (LeaveType $leaveType) use ($employee, $policyService, $today): array {
                $balance = $employee
                    ? $policyService->buildBalanceSummary($employee, $leaveType, $today)
                    : null;

                return [
                    'id' => $leaveType->id,
                    'name' => $leaveType->name,
                    'default_days' => (int) $leaveType->default_days,
                    'accrued_days' => $balance?->accrued_days ?? (int) $leaveType->default_days,
                    'used_days' => $balance?->used_days ?? 0,
                    'pending_days' => $balance?->pending_days ?? 0,
                    'remaining_days' => $balance?->remaining_days ?? max((int) $leaveType->default_days - ($balance?->used_days ?? 0), 0),
                    'is_paid' => (bool) $leaveType->is_paid,
                ];
            })
            ->values()
            ->all();
    }

    private function getMonthlyPayrollTrend(?string $companyId, Request $request): array
    {
        $today = Carbon::today();

        return collect(range(5, 0))->map(function (int $offset) use ($today, $companyId, $request): array {
            $date  = $today->copy()->subMonths($offset);
            $month = $date->month;
            $year  = $date->year;

            $query = Payroll::query()
                ->whereMonth('payment_date', $month)
                ->whereYear('payment_date', $year);
            $this->scopeToCompany($request, $query, 'employee.user');
            $this->applyManagedEmployeeScope($request, $query, 'employee');

            return [
                'label' => $date->format('M y'),
                'value' => round((float) $query->sum('net_salary'), 0),
            ];
        })->values()->all();
    }

    private function getHeadcountTrend(?string $companyId, Request $request): array
    {
        $today = Carbon::today();

        return collect(range(5, 0))->map(function (int $offset) use ($today, $companyId, $request): array {
            $endOfMonth = $today->copy()->subMonths($offset)->endOfMonth();

            $query = Employee::query()
                ->where('status', 'active')
                ->where('created_at', '<=', $endOfMonth);
            $this->scopeToCompany($request, $query);
            $this->applyManagedEmployeeScope($request, $query);

            return [
                'label' => $endOfMonth->format('M y'),
                'value' => $query->count(),
            ];
        })->values()->all();
    }

    private function getPerformanceSummary(Request $request): array
    {
        $goalBase = PerformanceGoal::query();
        $this->scopeToCompany($request, $goalBase, 'employee.user');
        $avgProgress    = round((float) (clone $goalBase)->avg('progress') ?? 0);
        $openGoals      = (clone $goalBase)->whereNotIn('status', ['completed'])->count();
        $completedGoals = (clone $goalBase)->where('status', 'completed')->count();

        $kpiBase = PerformanceKpi::query();
        $this->scopeToCompany($request, $kpiBase, 'employee.user');
        $totalKpis          = (clone $kpiBase)->count();
        $achievedKpis       = (clone $kpiBase)->whereRaw('current_value >= target_value')->count();
        $kpiAchievementRate = $totalKpis > 0 ? round(($achievedKpis / $totalKpis) * 100) : 0;

        $appraisalBase  = PerformanceAppraisal::query();
        $this->scopeToCompany($request, $appraisalBase, 'employee.user');
        $openAppraisals = $appraisalBase->count();

        return [
            'avg_goal_progress'    => $avgProgress,
            'open_goals'           => $openGoals,
            'completed_goals'      => $completedGoals,
            'kpi_achievement_rate' => $kpiAchievementRate,
            'open_appraisals'      => $openAppraisals,
        ];
    }

    private function getAttritionRisk(?string $companyId): array
    {
        $cutoff = Carbon::today()->subDays(30)->toDateString();

        $rows = DB::table('employees as e')
            ->join('users as u', 'u.id', '=', 'e.user_id')
            ->leftJoin('departments as d', 'd.id', '=', 'e.department_id')
            ->leftJoin('attendances as a', function ($join) use ($cutoff): void {
                $join->on('a.employee_id', '=', 'e.id')
                    ->where('a.date', '>=', $cutoff);
            })
            ->where('e.status', 'active')
            ->when($companyId, fn ($q) => $q->where('u.company_id', $companyId))
            ->groupBy('e.id', 'e.name', 'd.name')
            ->select([
                'e.id',
                'e.name',
                DB::raw("COALESCE(d.name, 'Unassigned') as department"),
                DB::raw('COUNT(a.id) as total_days'),
                DB::raw("SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_days"),
            ])
            ->havingRaw('COUNT(a.id) >= 5')
            ->havingRaw("SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) * 100 / COUNT(a.id) >= 20")
            ->orderByRaw("SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) * 100 / COUNT(a.id) DESC")
            ->limit(5)
            ->get();

        return $rows->map(fn ($row) => [
            'id'           => $row->id,
            'name'         => $row->name,
            'department'   => $row->department,
            'absent_days'  => (int) $row->absent_days,
            'total_days'   => (int) $row->total_days,
            'absence_rate' => $row->total_days > 0 ? round(((int) $row->absent_days / (int) $row->total_days) * 100) : 0,
        ])->values()->all();
    }

    private function announcementVisibleToUser(Announcement $announcement, User $user): bool
    {
        return match ($announcement->target) {
            'employees' => true,
            'hr' => $this->isHrUser($user),
            'managers' => $this->isManagerUser($user),
            default => true,
        };
    }

    private function isHrUser(User $user): bool
    {
        return $user->hasRole([
            User::ROLE_HR_MANAGER,
            User::ROLE_HR_EXECUTIVE,
            User::ROLE_COMPANY_ADMIN,
            User::ROLE_SUPER_ADMIN,
        ]);
    }

    private function isManagerUser(User $user): bool
    {
        return $user->hasRole([
            User::ROLE_DEPARTMENT_MANAGER,
            User::ROLE_HR_MANAGER,
            User::ROLE_COMPANY_ADMIN,
            User::ROLE_SUPER_ADMIN,
        ]);
    }
}
