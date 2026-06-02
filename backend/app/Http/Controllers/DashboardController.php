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
use App\Models\Payslip;
use App\Models\User;
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

        $upcomingHolidays = Holiday::query()
            ->whereDate('holiday_date', '>=', $today)
            ->orderBy('holiday_date')
            ->limit(5)
            ->get()
            ->map(fn (Holiday $holiday) => [
                'id' => $holiday->id,
                'name' => $holiday->name,
                'date' => $holiday->holiday_date?->toDateString() ?? (string) $holiday->holiday_date,
                'is_optional' => $holiday->is_optional,
            ])
            ->values();

        $announcements = Announcement::query()
            ->where('is_published', true)
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
                'shift' => $employee->shift?->only(['id', 'name']),
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

        $employees = Employee::count();
        $activeEmployees = Employee::where('status', 'active')->count();
        $todayAttendance = Attendance::whereDate('date', $today)->count();
        $todayPresent = Attendance::whereDate('date', $today)->whereIn('status', ['present', 'late'])->count();
        $pendingLeaves = Leave::where('status', 'pending')->count();
        $pendingPayrolls = Payroll::where('status', 'pending')->count();

        $attendanceRate = $todayAttendance > 0 ? round(($todayPresent / $todayAttendance) * 100, 2) : 0;
        $monthlyPayroll = Payroll::whereMonth('payment_date', $month)->whereYear('payment_date', $year)->sum('net_salary');

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

        $attendanceRows = Attendance::select('date', DB::raw('COUNT(*) as total'), DB::raw("SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) as present_count"))
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
            ->leftJoin('employees', 'employees.department_id', '=', 'departments.id')
            ->groupBy('departments.id', 'departments.name')
            ->orderByDesc('employee_count')
            ->limit(6)
            ->get()
            ->map(fn ($row) => [
                'label' => $row->name ?? 'Unassigned',
                'value' => (int) $row->employee_count,
            ])
            ->values();

        $leaveBreakdown = Leave::query()
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->get()
            ->map(fn ($row) => [
                'label' => ucfirst((string) $row->status),
                'value' => (int) $row->total,
            ])
            ->values();

        $recentEmployees = Employee::query()
            ->with('department:id,name')
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

        return $this->ok([
            'as_of_date' => $today->toDateString(),
            'attendance_trend' => $attendanceTrend,
            'department_distribution' => $departmentDistribution,
            'leave_breakdown' => $leaveBreakdown,
            'recent_employees' => $recentEmployees,
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
        $approvedLeaves = Leave::query()
            ->where('employee_id', $employeeId)
            ->where('status', 'approved')
            ->get(['type', 'from_date', 'to_date']);

        return LeaveType::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(function (LeaveType $leaveType) use ($approvedLeaves): array {
                $usedDays = $approvedLeaves->filter(function (Leave $leave) use ($leaveType): bool {
                    return mb_strtolower((string) $leave->type) === mb_strtolower((string) $leaveType->name);
                })->sum(function (Leave $leave): int {
                    return Carbon::parse($leave->from_date)->diffInDays(Carbon::parse($leave->to_date)) + 1;
                });

                $defaultDays = (int) $leaveType->default_days;

                return [
                    'id' => $leaveType->id,
                    'name' => $leaveType->name,
                    'default_days' => $defaultDays,
                    'used_days' => (int) $usedDays,
                    'remaining_days' => max($defaultDays - (int) $usedDays, 0),
                    'is_paid' => (bool) $leaveType->is_paid,
                ];
            })
            ->values()
            ->all();
    }

    private function announcementVisibleToUser(Announcement $announcement, User $user): bool
    {
        $roleName = $this->resolveRoleName($user);

        return match ($announcement->target) {
            'employees' => $roleName === User::ROLE_EMPLOYEE,
            'hr' => in_array($roleName, [User::ROLE_HR_MANAGER, User::ROLE_HR_EXECUTIVE, User::ROLE_COMPANY_ADMIN, User::ROLE_SUPER_ADMIN], true),
            'managers' => in_array($roleName, [User::ROLE_DEPARTMENT_MANAGER, User::ROLE_HR_MANAGER, User::ROLE_COMPANY_ADMIN, User::ROLE_SUPER_ADMIN], true),
            default => true,
        };
    }
}
