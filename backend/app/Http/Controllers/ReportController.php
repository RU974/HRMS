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

        $paginator = $query->orderByDesc('created_at')->paginate((int) ($validated['per_page'] ?? 10));
        $service = new ReportAnalyticsService();
        $paginator->getCollection()->transform(fn (Report $report) => $service->enrichReport($report));

        return $this->ok($paginator);
    }

    public function show($id)
    {
        $this->authorizeAnyPermission(request(), ['view reports', 'manage reports']);

        $report = Report::with(['creator:id,name,email', 'updater:id,name,email'])->findOrFail($id);
        $this->assertCompanyAccess(request(), $report);

        $service = new ReportAnalyticsService();
        return $this->ok($service->enrichReport($report));
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
        $this->authorizePermission($request, 'manage reports');

        $report = Report::findOrFail($id);
        $this->assertCompanyAccess($request, $report);
        $report->delete();

        return $this->ok(null, 'Report deleted successfully');
    }

    public function employees(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

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
                $format
            );
        }

        return $this->ok($data);
    }

    public function attendance(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

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
                $format
            );
        }

        return $this->ok($data);
    }

    public function leave(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

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
                $format
            );
        }

        return $this->ok($data);
    }

    public function payroll(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

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
                ['Status', 'Total Records', 'Total Net Salary', 'Total Base Salary', 'Total Bonus', 'Total Deductions', 'Total Tax'],
                $data->map(fn ($row) => [
                    'status' => $row->status,
                    'total_records' => $row->total_records,
                    'total_net_salary' => $row->total_net_salary,
                    'total_base_salary' => $row->total_base_salary,
                    'total_bonus' => $row->total_bonus,
                    'total_deductions' => $row->total_deductions,
                    'total_tax' => $row->total_tax,
                ])->toArray(),
                $format
            );
        }

        return $this->ok($data);
    }

    public function analytics(Request $request)
    {
        $this->authorizeAnyPermission($request, ['view reports', 'manage reports']);

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
                $format
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

        if (!$request->user()?->can('export reports')) {
            abort(403, 'You are not authorized to export reports.');
        }

        $format = strtolower(trim($format));
        if (!in_array($format, ['csv', 'excel', 'xlsx', 'pdf'], true)) {
            abort(422, 'Unsupported export format.');
        }

        return $format;
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
        $this->applyManagedEmployeeScope($request, $query);
    }

    private function scopeAttendanceQuery(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
        $this->applyManagedEmployeeScope($request, $query, 'employee');
    }

    private function scopePayrollQuery(Request $request, $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->whereHas('employee.user', function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
        }
        $this->applyManagedEmployeeScope($request, $query, 'employee');
    }
}
