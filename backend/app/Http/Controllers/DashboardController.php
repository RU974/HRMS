<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
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
}
