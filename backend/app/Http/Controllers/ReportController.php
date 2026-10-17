<?php

namespace App\Http\Controllers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\Report;
use App\Services\ReportAnalyticsService;
use App\Services\ReportExportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    private const REPORT_TYPES = ['attendance', 'employee', 'leave', 'payroll', 'inventory', 'custom'];

    public function index(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'q' => 'nullable|string|max:100',
            'type' => ['nullable', Rule::in(self::REPORT_TYPES)],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'module' => 'nullable|string|max:50',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = Report::query()->with(['creator:id,name,email', 'updater:id,name,email']);
        $this->scopeToCompany($request, $query, 'creator');

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

        $paginator = $query->orderByDesc('created_at')->paginate((int) ($validated['per_page'] ?? 10));
        $service = new ReportAnalyticsService();
        $paginator->getCollection()->transform(fn (Report $report) => $service->enrichReport($report));

        return $this->ok($paginator);
    }

    public function show($id)
    {
        $this->authorizeAnyPermission(request(), ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $report = Report::with(['creator:id,name,email', 'updater:id,name,email'])->findOrFail($id);
        $this->assertCompanyAccess(request(), $report);

        $service = new ReportAnalyticsService();
        return $this->ok($service->enrichReport($report));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'reports:manage_settings');

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
        $this->authorizePermission($request, 'reports:manage_settings');

        $report = Report::findOrFail($id);
        $this->assertCompanyAccess($request, $report);

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
        $this->authorizePermission($request, 'reports:manage_settings');

        $report = Report::findOrFail($id);
        $this->assertCompanyAccess($request, $report);
        $report->delete();

        return $this->ok(null, 'Report deleted successfully');
    }

    public function updateSchedule(Request $request, $id)
    {
        $this->authorizePermission($request, 'reports:manage_settings');

        $report = Report::findOrFail($id);
        $this->assertCompanyAccess($request, $report);

        $validated = $request->validate([
            'enabled' => 'required|boolean',
            'interval' => ['required_if:enabled,1', Rule::in(['daily', 'weekly'])],
            'recipients' => 'required_if:enabled,1|array|min:1',
            'recipients.*' => 'email',
            'format' => ['nullable', Rule::in(['csv', 'excel', 'pdf'])],
            'timezone' => 'nullable|string|max:64',
        ]);

        $filters = $report->filters ?? [];
        $existingSchedule = is_array($filters['schedule'] ?? null) ? $filters['schedule'] : [];
        $timezone = $validated['timezone'] ?? $existingSchedule['timezone'] ?? config('app.timezone');

        if ($validated['enabled']) {
            $filters['schedule'] = [
                'enabled' => true,
                'interval' => $validated['interval'],
                'recipients' => $validated['recipients'],
                'format' => $validated['format'] ?? ($existingSchedule['format'] ?? 'csv'),
                'timezone' => $timezone,
                'next_run_at' => ReportAnalyticsService::computeNextRun($validated['interval'], $timezone)->toIso8601String(),
                'last_sent_at' => $existingSchedule['last_sent_at'] ?? null,
            ];
        } else {
            $filters['schedule'] = [
                'enabled' => false,
                'interval' => $existingSchedule['interval'] ?? null,
                'recipients' => $existingSchedule['recipients'] ?? [],
                'format' => $existingSchedule['format'] ?? 'csv',
                'timezone' => $timezone,
                'next_run_at' => null,
                'last_sent_at' => $existingSchedule['last_sent_at'] ?? null,
            ];
        }

        $report->update([
            'filters' => $filters,
            'updated_by' => $request->user()?->id,
        ]);

        $service = new ReportAnalyticsService();
        return $this->ok($service->enrichReport($report), 'Report schedule updated successfully');
    }

    public function employees(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $service = new ReportAnalyticsService();
        $data = $service->employeeSummary($request);
        $format = $this->resolveExportFormat($request);

        if ($format) {
            return (new ReportExportService())->export(
                'employee-report',
                ['Status', 'Count'],
                $data->map(fn ($row) => [
                    'status' => $row->status,
                    'count' => $row->count,
                ])->toArray(),
                $format,
                $this->exportContext($request)
            );
        }

        return $this->ok($data);
    }

    public function attendance(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $service = new ReportAnalyticsService();
        $data = $service->attendanceSummary($request, $validated['month'], $validated['year']);
        $format = $this->resolveExportFormat($request);

        if ($format) {
            return (new ReportExportService())->export(
                'attendance-report-' . $validated['year'] . '-' . $validated['month'],
                ['Status', 'Count'],
                $data->map(fn ($row) => [
                    'status' => $row->status,
                    'count' => $row->count,
                ])->toArray(),
                $format,
                $this->exportContext($request)
            );
        }

        return $this->ok($data);
    }

    /**
     * Detailed attendance for a month. `view` picks what an export contains
     * (employees, departments, late, overtime or grid); the JSON response always carries everything.
     */
    public function attendanceDetail(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
            'department_id' => 'nullable|integer',
            'view' => 'nullable|in:employees,departments,late,overtime,grid',
        ]);

        $month = (int) $validated['month'];
        $year = (int) $validated['year'];
        $view = $validated['view'] ?? 'employees';

        $data = (new ReportAnalyticsService())->attendanceDetail(
            $request,
            $month,
            $year,
            isset($validated['department_id']) ? (int) $validated['department_id'] : null
        );

        $format = $this->resolveExportFormat($request);
        if (!$format) {
            return $this->ok($data);
        }

        [$columns, $rows] = $this->attendanceDetailExport($data, $view);

        return (new ReportExportService())->export(
            "attendance-{$view}-{$year}-{$month}",
            $columns,
            $rows,
            $format,
            $this->exportContext($request)
        );
    }

    private function attendanceDetailExport(array $data, string $view): array
    {
        $employees = collect($data['employees']);

        switch ($view) {
            case 'departments':
                return [
                    ['Department', 'Headcount', 'Present', 'Late', 'Absent', 'Leave', 'Half Day', 'Hours Worked', 'Avg Hours/Day', 'Overtime Hours', 'Attendance %'],
                    collect($data['departments'])->map(fn ($d) => [
                        'department' => $d['department'], 'headcount' => $d['headcount'], 'present' => $d['present'],
                        'late' => $d['late'], 'absent' => $d['absent'], 'leave' => $d['leave'], 'half_day' => $d['half_day'],
                        'hours_worked' => $d['hours_worked'], 'avg_hours' => $d['avg_hours'],
                        'overtime_hours' => $d['overtime_hours'], 'attendance_rate' => $d['attendance_rate'],
                    ])->all(),
                ];

            case 'late':
                return [
                    ['Employee', 'Department', 'Late Days', 'Total Late Minutes', 'Avg Late Minutes', 'Early Leaves'],
                    $employees->filter(fn ($e) => $e['late_count'] > 0)->sortByDesc('late_count')->map(fn ($e) => [
                        'name' => $e['name'], 'department' => $e['department'], 'late_count' => $e['late_count'],
                        'late_minutes' => $e['late_minutes'], 'avg_late' => round($e['late_minutes'] / $e['late_count'], 1),
                        'early_leave_count' => $e['early_leave_count'],
                    ])->values()->all(),
                ];

            case 'overtime':
                return [
                    ['Employee', 'Department', 'Overtime Hours', 'Days With Overtime', 'Hours Worked'],
                    $employees->filter(fn ($e) => $e['overtime_hours'] > 0)->sortByDesc('overtime_hours')->map(fn ($e) => [
                        'name' => $e['name'], 'department' => $e['department'], 'overtime_hours' => $e['overtime_hours'],
                        'overtime_days' => collect($e['days'])->where('overtime', '>', 0)->count(),
                        'hours_worked' => $e['hours_worked'],
                    ])->values()->all(),
                ];

            case 'grid':
                $codes = ['present' => 'P', 'late' => 'L', 'absent' => 'A', 'leave' => 'LV', 'half_day' => 'HD', 'missing_check_in' => 'MI', 'missing_check_out' => 'MO'];
                $days = range(1, (int) $data['days_in_month']);

                return [
                    array_merge(['Employee', 'Department'], array_map('strval', $days), ['Present', 'Late', 'Absent', 'Leave']),
                    $employees->map(fn ($e) => array_merge(
                        ['name' => $e['name'], 'department' => $e['department']],
                        collect($days)->mapWithKeys(fn ($d) => ["d{$d}" => $codes[$e['days'][$d]['status'] ?? ''] ?? ''])->all(),
                        ['present' => $e['present'], 'late' => $e['late'], 'absent' => $e['absent'], 'leave' => $e['leave']]
                    ))->all(),
                ];

            default:
                return [
                    ['Employee', 'Department', 'Present', 'Late', 'Absent', 'Leave', 'Half Day', 'Hours Worked', 'Avg Hours/Day', 'Overtime Hours', 'Late Minutes', 'Attendance %'],
                    $employees->map(fn ($e) => [
                        'name' => $e['name'], 'department' => $e['department'], 'present' => $e['present'], 'late' => $e['late'],
                        'absent' => $e['absent'], 'leave' => $e['leave'], 'half_day' => $e['half_day'],
                        'hours_worked' => $e['hours_worked'], 'avg_hours' => $e['avg_hours'],
                        'overtime_hours' => $e['overtime_hours'], 'late_minutes' => $e['late_minutes'],
                        'attendance_rate' => $e['attendance_rate'],
                    ])->all(),
                ];
        }
    }

    public function leave(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $service = new ReportAnalyticsService();
        $data = $service->leaveSummary($request, $validated['month'], $validated['year']);
        $format = $this->resolveExportFormat($request);

        if ($format) {
            return (new ReportExportService())->export(
                'leave-report-' . $validated['year'] . '-' . $validated['month'],
                ['Status', 'Count'],
                $data->map(fn ($row) => [
                    'status' => $row->status,
                    'count' => $row->count,
                ])->toArray(),
                $format,
                $this->exportContext($request)
            );
        }

        return $this->ok($data);
    }

    public function payroll(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $service = new ReportAnalyticsService();
        $data = $service->payrollSummary($request, $validated['month'], $validated['year']);
        $format = $this->resolveExportFormat($request);

        if ($format) {
            return (new ReportExportService())->export(
                'payroll-report-' . $validated['year'] . '-' . $validated['month'],
                ['Status', 'Total Records', 'Total Net Salary', 'Total Base Salary', 'Total Bonus', 'Total Commission', 'Total Deductions', 'Total Tax'],
                $data->map(fn ($row) => [
                    'status' => $row->status,
                    'total_records' => $row->total_records,
                    'total_net_salary' => $row->total_net_salary,
                    'total_base_salary' => $row->total_base_salary,
                    'total_bonus' => $row->total_bonus,
                    'total_commission' => $row->total_commission,
                    'total_deductions' => $row->total_deductions,
                    'total_tax' => $row->total_tax,
                ])->toArray(),
                $format,
                $this->exportContext($request)
            );
        }

        return $this->ok($data);
    }

    public function inventory(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'low_stock_threshold' => 'nullable|integer|min:0|max:100000',
        ]);

        $service = new ReportAnalyticsService();
        $data = $service->inventorySummary($request, (int) ($validated['low_stock_threshold'] ?? 5));
        $format = $this->resolveExportFormat($request);

        if ($format) {
            return (new ReportExportService())->export(
                'inventory-report',
                ['Category', 'Item Count', 'Total Quantity', 'Available Quantity', 'Assigned Quantity', 'Total Value'],
                collect($data['by_category'])->map(fn ($row) => [
                    'category' => $row->category,
                    'item_count' => $row->item_count,
                    'total_quantity' => $row->total_quantity,
                    'total_available' => $row->total_available,
                    'total_assigned' => $row->total_assigned,
                    'total_value' => $row->total_value,
                ])->toArray(),
                $format,
                $this->exportContext($request)
            );
        }

        return $this->ok($data);
    }

    public function analytics(Request $request)
    {
        $this->authorizeAnyPermission($request, ['reports:view', 'reports:manage_settings', 'reports:view_own']);

        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000',
        ]);

        $service = new ReportAnalyticsService();
        $data = $service->analyticsOverview($request, $validated['month'], $validated['year']);
        $format = $this->resolveExportFormat($request);

        if ($format) {
            return (new ReportExportService())->export(
                'analytics-report-' . $validated['year'] . '-' . $validated['month'],
                ['Metric', 'Value'],
                collect($data)->map(fn ($value, $key) => [
                    'metric' => $key,
                    'value' => $value,
                ])->values()->toArray(),
                $format,
                $this->exportContext($request)
            );
        }

        return $this->ok($data);
    }

    private function resolveExportFormat(Request $request): ?string
    {
        $format = $request->query('format');
        if (!$format) {
            return null;
        }

        if (!$request->user()?->can('reports:export')) {
            abort(403, 'You are not authorized to export reports.');
        }

        $format = strtolower(trim($format));
        if (!in_array($format, ['csv', 'excel', 'xlsx', 'pdf'], true)) {
            abort(422, 'Unsupported export format.');
        }

        return $format;
    }

    /**
     * Branding/attribution passed to the export builder. The PDF template
     * choice only applies to the pdf format; other formats ignore it.
     */
    private function exportContext(Request $request): array
    {
        $template = strtolower((string) $request->query('template', 'classic'));
        if (!in_array($template, ReportExportService::PDF_TEMPLATES, true)) {
            $template = 'classic';
        }

        $company = $request->user()?->company;
        $logoPath = $company?->logo_path ? Storage::disk('public')->path($company->logo_path) : null;
        $logoUri = $logoPath && is_file($logoPath) ? 'file://' . str_replace('\\', '/', $logoPath) : null;

        return [
            'template' => $template,
            'company_name' => $company->name ?? 'HRMS',
            'company_logo' => $logoUri,
            'company_address' => $company?->address,
            'company_email' => $company?->email,
            'company_phone' => $company?->phone,
            'company_website' => $company?->website,
            'generated_by' => $request->user()?->name,
        ];
    }

    private function assertCompanyAccess(Request $request, Report $report): void
    {
        $query = Report::query()->whereKey($report->id);
        $this->scopeToCompany($request, $query, 'creator');
        if (!$query->exists()) {
            abort(403, 'You are not authorized to access this report.');
        }
    }

    private function scopeEmployeeQuery(Request $request, $query): void
    {
        $this->scopeToCompany($request, $query, 'user');
        $this->applyManagedEmployeeScope($request, $query);
    }

    private function scopeAttendanceQuery(Request $request, $query): void
    {
        $this->scopeToCompany($request, $query, 'employee.user');
        $this->applyManagedEmployeeScope($request, $query, 'employee');
    }

    private function scopePayrollQuery(Request $request, $query): void
    {
        $this->scopeToCompany($request, $query, 'employee.user');
        $this->applyManagedEmployeeScope($request, $query, 'employee');
    }
}