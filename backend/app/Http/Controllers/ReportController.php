<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function employees(Request $request)
    {
        $data = Employee::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function attendance(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Attendance::whereMonth('date', $validated['month'])
            ->whereYear('date', $validated['year'])
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function leave(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Leave::whereMonth('from_date', $validated['month'])
            ->whereYear('from_date', $validated['year'])
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function payroll(Request $request)
    {
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Payroll::whereMonth('payment_date', $validated['month'])
            ->whereYear('payment_date', $validated['year'])
            ->selectRaw('status, COUNT(*) as total_records, SUM(net_salary) as total_net_salary')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }
}
