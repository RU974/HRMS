<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use Carbon\Carbon;
use Illuminate\Http\Request;

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
}
