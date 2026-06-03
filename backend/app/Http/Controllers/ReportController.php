<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    private const REPORT_TYPES = ['attendance', 'employee', 'leave', 'payroll', 'custom'];

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

        $validated = $request->validate([
            'q' => 'nullable|string|max:100',
            'type' => ['nullable', Rule::in(self::REPORT_TYPES)],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'module' => 'nullable|string|max:50',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = Report::query()->with(['creator:id,name,email', 'updater:id,name,email']);
        $this->scopeToCompany($request, $query);

        if (!empty($validated['q'])) {
            $query->where(function ($q) use ($validated) {
                $term = '%' . $validated['q'] . '%';
                $q->where('name', 'like', $term)
                    ->orWhere('description', 'like', $term);
            });
        }
        if (!empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }
        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (!empty($validated['module'])) {
            $query->whereJsonContains('filters->module', $validated['module']);
        }

        return $this->ok($query->orderByDesc('created_at')->paginate((int) ($validated['per_page'] ?? 10)));
    }

    public function show($id)
    {
        $this->authorizeAnyPermission(request(), ['view reports', 'manage reports']);

        $report = Report::with(['creator:id,name,email', 'updater:id,name,email'])->findOrFail($id);
        $this->assertCompanyAccess(request(), $report);
        return $this->ok($report);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage reports');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'type' => ['required', Rule::in(self::REPORT_TYPES)],
            'description' => 'nullable|string|max:1000',
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'filters' => 'nullable|array',
        ]);

        $report = Report::create([
            ...$validated,
            'status' => $validated['status'] ?? 'active',
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return $this->ok($report->load(['creator:id,name,email', 'updater:id,name,email']), 'Report created successfully', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage reports');

        $report = Report::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => ['sometimes', Rule::in(self::REPORT_TYPES)],
            'description' => 'nullable|string|max:1000',
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'filters' => 'nullable|array',
            'last_run_at' => 'nullable|date',
        ]);

        $report->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        return $this->ok($report->load(['creator:id,name,email', 'updater:id,name,email']), 'Report updated successfully');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizePermission($request, 'manage reports');

        Report::findOrFail($id)->delete();
        return $this->ok(null, 'Report deleted successfully');
    }

    public function employees(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

        $data = Employee::query()
            ->selectRaw('status, COUNT(*) as count')
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function attendance(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Attendance::whereMonth('date', $validated['month'])
            ->whereYear('date', $validated['year'])
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function leave(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Leave::whereMonth('from_date', $validated['month'])
            ->whereYear('from_date', $validated['year'])
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function payroll(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $data = Payroll::whereMonth('payment_date', $validated['month'])
            ->whereYear('payment_date', $validated['year'])
            ->when($request->user()?->company_id, function ($query) use ($request): void {
                $query->whereHas('employee.user', function ($userQuery) use ($request): void {
                    $userQuery->where('company_id', $request->user()?->company_id);
                });
            })
            ->selectRaw('status, COUNT(*) as total_records, SUM(net_salary) as total_net_salary')
            ->groupBy('status')
            ->get();

        return $this->ok($data);
    }

    public function analytics(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $employeesQuery = Employee::query();
        $this->scopeEmployeeQuery($request, $employeesQuery);

        $attendanceQuery = Attendance::whereMonth('date', $validated['month'])
            ->whereYear('date', $validated['year']);
        $this->scopeAttendanceQuery($request, $attendanceQuery);

        $payrollQuery = Payroll::whereMonth('payment_date', $validated['month'])
            ->whereYear('payment_date', $validated['year']);
        $this->scopePayrollQuery($request, $payrollQuery);

        $employees = $employeesQuery->count();
        $activeEmployees = (clone $employeesQuery)->where('status', 'active')->count();

        $attendance = $attendanceQuery
            ->selectRaw('
                SUM(CASE WHEN status = "present" THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = "late" THEN 1 ELSE 0 END) as late_count,
                SUM(CASE WHEN status = "absent" THEN 1 ELSE 0 END) as absent_count
            ')
            ->first();

        $payroll = $payrollQuery
            ->selectRaw('
                SUM(CASE WHEN status = "paid" THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
                COALESCE(SUM(net_salary), 0) as total_amount
            ')
            ->first();

        return $this->ok([
            'employees' => $employees,
            'active_employees' => $activeEmployees,
            'attendance_present' => (int) ($attendance?->present_count ?? 0),
            'attendance_late' => (int) ($attendance?->late_count ?? 0),
            'attendance_absent' => (int) ($attendance?->absent_count ?? 0),
            'payroll_paid' => (int) ($payroll?->paid_count ?? 0),
            'payroll_pending' => (int) ($payroll?->pending_count ?? 0),
            'payroll_total_amount' => (float) ($payroll?->total_amount ?? 0),
        ]);
    }

    private function scopeToCompany(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        $query->whereHas('creator', function ($creatorQuery) use ($companyId): void {
            $creatorQuery->where('company_id', $companyId);
        });
    }

    private function assertCompanyAccess(Request $request, Report $report): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        $allowed = Report::query()
            ->whereKey($report->id)
            ->whereHas('creator', function ($creatorQuery) use ($companyId): void {
                $creatorQuery->where('company_id', $companyId);
            })
            ->exists();

        if (!$allowed) {
            abort(403, 'You are not authorized to access this report.');
        }
    }

    private function scopeEmployeeQuery(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }

    private function scopeAttendanceQuery(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }

    private function scopePayrollQuery(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
    }
}
