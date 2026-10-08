<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\InventoryAssignment;
use App\Models\InventoryItem;
use App\Models\Leave;
use App\Models\Payroll;
use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class ReportAnalyticsService
{
    public function employeeSummary(Request $request): Collection
    {
        $query = Employee::query()
            ->selectRaw('status, COUNT(*) as count');

        $this->scopeByCompany($request, $query, 'user');

        if ($this->isViewOwnOnly($request)) {
            $this->scopeToOwnEmployee($request, $query);
        } else {
            $this->applyManagedEmployeeScope($request, $query);
        }

        return $query->groupBy('status')->get();
    }

    public function attendanceSummary(Request $request, int $month, int $year): Collection
    {
        $query = Attendance::query()
            ->whereMonth('date', $month)
            ->whereYear('date', $year)
            ->selectRaw('status, COUNT(*) as count');

        $this->scopeByCompany($request, $query, 'employee.user');

        if ($this->isViewOwnOnly($request)) {
            $this->scopeToOwnEmployee($request, $query, 'employee');
        } else {
            $this->applyManagedEmployeeScope($request, $query, 'employee');
        }

        return $query->groupBy('status')->get();
    }

    public function leaveSummary(Request $request, int $month, int $year): Collection
    {
        $query = Leave::query()
            ->whereMonth('from_date', $month)
            ->whereYear('from_date', $year)
            ->selectRaw('status, COUNT(*) as count');

        $this->scopeByCompany($request, $query, 'employee.user');

        if ($this->isViewOwnOnly($request)) {
            $this->scopeToOwnEmployee($request, $query, 'employee');
        } else {
            $this->applyManagedEmployeeScope($request, $query, 'employee');
        }

        return $query->groupBy('status')->get();
    }

    public function payrollSummary(Request $request, int $month, int $year): Collection
    {
        $query = Payroll::query()
            ->whereMonth('payment_date', $month)
            ->whereYear('payment_date', $year)
            ->selectRaw(
                'status, COUNT(*) as total_records, SUM(net_salary) as total_net_salary, SUM(base_salary) as total_base_salary, SUM(bonus) as total_bonus, SUM(commission) as total_commission, SUM(deductions) as total_deductions, SUM(tax) as total_tax'
            );

        $this->scopeByCompany($request, $query, 'employee.user');

        if ($this->isViewOwnOnly($request)) {
            $this->scopeToOwnEmployee($request, $query, 'employee');
        } else {
            $this->applyManagedEmployeeScope($request, $query, 'employee');
        }

        return $query->groupBy('status')->get();
    }

    public function inventorySummary(Request $request, int $lowStockThreshold = 5): array
    {
        // InventoryItem/InventoryCategory carry a global CompanyScope, so no
        // manual scopeByCompany() call is needed on these queries.
        $byCategory = InventoryItem::query()
            ->leftJoin('inventory_categories', 'inventory_categories.id', '=', 'inventory_items.category_id')
            ->selectRaw(
                "COALESCE(inventory_categories.name, 'Uncategorized') as category,
                 COUNT(inventory_items.id) as item_count,
                 SUM(inventory_items.quantity) as total_quantity,
                 SUM(inventory_items.quantity_available) as total_available,
                 SUM(inventory_items.quantity - inventory_items.quantity_available) as total_assigned,
                 SUM(inventory_items.quantity * inventory_items.unit_cost) as total_value"
            )
            ->groupBy('category')
            ->orderBy('category')
            ->get();

        $byCondition = InventoryItem::query()
            ->selectRaw(
                '`condition`,
                 COUNT(*) as item_count,
                 SUM(quantity) as total_quantity,
                 SUM(quantity_available) as total_available,
                 SUM(quantity * unit_cost) as total_value'
            )
            ->groupBy('condition')
            ->orderBy('condition')
            ->get();

        $totals = InventoryItem::query()
            ->selectRaw(
                'COUNT(*) as total_items,
                 SUM(quantity) as total_quantity,
                 SUM(quantity_available) as total_available,
                 SUM(quantity - quantity_available) as total_assigned,
                 SUM(quantity * unit_cost) as total_value'
            )
            ->first();

        $lowStock = InventoryItem::query()
            ->with('category:id,name')
            ->where('quantity_available', '<=', $lowStockThreshold)
            ->orderBy('quantity_available')
            ->get(['id', 'category_id', 'name', 'sku', 'quantity', 'quantity_available', 'unit_cost', 'location', 'condition']);

        // whereHas('item') implicitly applies InventoryItem's global
        // CompanyScope, scoping assignments to the current company.
        $assignmentStatus = InventoryAssignment::query()
            ->whereHas('item')
            ->selectRaw('status, COUNT(*) as count, SUM(quantity) as total_quantity')
            ->groupBy('status')
            ->get();

        return [
            'by_category' => $byCategory,
            'by_condition' => $byCondition,
            'totals' => [
                'total_items' => (int) ($totals?->total_items ?? 0),
                'total_quantity' => (int) ($totals?->total_quantity ?? 0),
                'total_available' => (int) ($totals?->total_available ?? 0),
                'total_assigned' => (int) ($totals?->total_assigned ?? 0),
                'total_value' => round((float) ($totals?->total_value ?? 0), 2),
            ],
            'low_stock_threshold' => $lowStockThreshold,
            'low_stock' => $lowStock,
            'assignment_status' => $assignmentStatus,
        ];
    }

    public function analyticsOverview(Request $request, int $month, int $year): array
    {
        $viewOwnOnly = $this->isViewOwnOnly($request);

        $employeeQuery = Employee::query();
        $this->scopeByCompany($request, $employeeQuery, 'user');
        if ($viewOwnOnly) {
            $this->scopeToOwnEmployee($request, $employeeQuery);
        } else {
            $this->applyManagedEmployeeScope($request, $employeeQuery);
        }

        $totalEmployees  = (clone $employeeQuery)->count();
        $activeEmployees = (clone $employeeQuery)->where('status', 'active')->count();
        $inactiveEmployees = max(0, $totalEmployees - $activeEmployees);

        $attendanceQuery = Attendance::query()
            ->whereMonth('date', $month)
            ->whereYear('date', $year);
        $this->scopeByCompany($request, $attendanceQuery, 'employee.user');
        if ($viewOwnOnly) {
            $this->scopeToOwnEmployee($request, $attendanceQuery, 'employee');
        } else {
            $this->applyManagedEmployeeScope($request, $attendanceQuery, 'employee');
        }

        $attendance = $attendanceQuery->selectRaw(
            'SUM(CASE WHEN status = "present" THEN 1 ELSE 0 END) as present_count,
             SUM(CASE WHEN status = "late" THEN 1 ELSE 0 END) as late_count,
             SUM(CASE WHEN status = "absent" THEN 1 ELSE 0 END) as absent_count,
             SUM(CASE WHEN status = "leave" THEN 1 ELSE 0 END) as leave_count,
             COUNT(*) as total_attendance'
        )->first();

        $payrollQuery = Payroll::query()
            ->whereMonth('payment_date', $month)
            ->whereYear('payment_date', $year);
        $this->scopeByCompany($request, $payrollQuery, 'employee.user');
        if ($viewOwnOnly) {
            $this->scopeToOwnEmployee($request, $payrollQuery, 'employee');
        } else {
            $this->applyManagedEmployeeScope($request, $payrollQuery, 'employee');
        }

        $payrollMetrics = $payrollQuery->selectRaw(
            'SUM(net_salary) as total_amount,
             AVG(net_salary) as average_net_salary,
             SUM(CASE WHEN status = "paid" THEN 1 ELSE 0 END) as paid_count,
             SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count,
             SUM(CASE WHEN status = "processed" THEN 1 ELSE 0 END) as processed_count,
             SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as approved_count'
        )->first();

        $breakdown = Payroll::query()
            ->whereMonth('payment_date', $month)
            ->whereYear('payment_date', $year);
        $this->scopeByCompany($request, $breakdown, 'employee.user');
        if ($viewOwnOnly) {
            $this->scopeToOwnEmployee($request, $breakdown, 'employee');
        } else {
            $this->applyManagedEmployeeScope($request, $breakdown, 'employee');
        }

        $statusBreakdown = $breakdown
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->status => (int) $row->count])
            ->all();

        $totalAttendance = (int) ($attendance?->total_attendance ?? 0);
        $presentCount    = (int) ($attendance?->present_count ?? 0);
        $attendanceRate  = $totalAttendance > 0 ? round(($presentCount / $totalAttendance) * 100, 2) : 0;

        return [
            'employees'                => $totalEmployees,
            'active_employees'         => $activeEmployees,
            'inactive_employees'       => $inactiveEmployees,
            'active_employee_ratio'    => $totalEmployees > 0 ? round(($activeEmployees / $totalEmployees) * 100, 2) : 0,
            'attendance_present'       => $presentCount,
            'attendance_late'          => (int) ($attendance?->late_count ?? 0),
            'attendance_absent'        => (int) ($attendance?->absent_count ?? 0),
            'attendance_leave'         => (int) ($attendance?->leave_count ?? 0),
            'attendance_total'         => $totalAttendance,
            'attendance_rate'          => $attendanceRate,
            'payroll_paid'             => (int) ($payrollMetrics?->paid_count ?? 0),
            'payroll_pending'          => (int) ($payrollMetrics?->pending_count ?? 0),
            'payroll_processed'        => (int) ($payrollMetrics?->processed_count ?? 0),
            'payroll_approved'         => (int) ($payrollMetrics?->approved_count ?? 0),
            'payroll_total_amount'     => round((float) ($payrollMetrics?->total_amount ?? 0), 2),
            'payroll_average_net_salary' => round((float) ($payrollMetrics?->average_net_salary ?? 0), 2),
            'payroll_status_breakdown' => $statusBreakdown,
        ];
    }

    public function enrichReport(Report $report): array
    {
        $data = $report->toArray();

        if (!empty($data['filters']['schedule']) && is_array($data['filters']['schedule'])) {
            $data['schedule'] = $this->normalizeSchedule($data['filters']['schedule']);
        }

        return $data;
    }

    /**
     * Computes the next scheduled send time for a "daily" or "weekly"
     * report delivery, anchored to 08:00 in the given timezone.
     */
    public static function computeNextRun(string $interval, string $timezone = 'UTC'): \Carbon\Carbon
    {
        return $interval === 'weekly'
            ? \Carbon\Carbon::now($timezone)->addWeek()->setTime(8, 0)
            : \Carbon\Carbon::now($timezone)->addDay()->setTime(8, 0);
    }

    // ──────────────────────────────────────────────────────────────
    //  Scoping helpers
    // ──────────────────────────────────────────────────────────────

    /**
     * Returns true when the user has ONLY reports:view_own and lacks
     * the broader reports:view / reports:manage_settings permission.
     * In that case every query must be restricted to the user's own
     * employee record.
     */
    private function isViewOwnOnly(Request $request): bool
    {
        $user = $request->user();
        if (!$user) {
            return false;
        }

        $hasBroad = $user->can('reports:view') || $user->can('reports:manage_settings');
        return !$hasBroad && $user->can('reports:view_own');
    }

    /**
     * Restricts a query to only the rows that belong to the authenticated
     * user's own employee record.
     *
     * @param  string|null  $employeeRelation  The Eloquent relation path to the
     *                                          Employee model (null when the
     *                                          root model IS Employee).
     */
    private function scopeToOwnEmployee(Request $request, $query, ?string $employeeRelation = null): void
    {
        $user     = $request->user();
        $employee = $user?->employee;

        if (!$employee) {
            // No employee record linked — return nothing.
            $query->whereRaw('1 = 0');
            return;
        }

        $employeeId = $employee->id;

        if ($employeeRelation) {
            $query->whereHas($employeeRelation, fn ($q) => $q->where('id', $employeeId));
        } else {
            // Root model is Employee itself.
            $query->where('id', $employeeId);
        }
    }

    private function normalizeSchedule(array $schedule): array
    {
        return [
            'enabled'    => isset($schedule['enabled']) ? (bool) $schedule['enabled'] : true,
            'interval'   => $schedule['interval'] ?? null,
            'next_run_at' => $this->formatDateTime($schedule['next_run_at'] ?? null),
            'timezone'   => $schedule['timezone'] ?? config('app.timezone'),
        ];
    }

    private function formatDateTime(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('c');
        }

        if (is_numeric($value)) {
            return date('c', (int) $value);
        }

        if (is_string($value) && strtotime($value) !== false) {
            return date('c', strtotime($value));
        }

        return null;
    }

    private function scopeByCompany(Request $request, $query, ?string $relation = null): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if ($relation) {
            $query->whereHas($relation, function ($userQuery) use ($companyId): void {
                $userQuery->where('company_id', $companyId);
            });
            return;
        }

        if (method_exists($query, 'whereHas')) {
            $query->where('company_id', $companyId);
        }
    }

    private function applyManagedEmployeeScope(Request $request, $query, ?string $employeeRelation = null): void
    {
        if (!$this->shouldScopeToManagedEmployees($request)) {
            return;
        }

        $user    = $request->user();
        $manager = $user?->employee;
        if (!$manager) {
            return;
        }

        $managerId    = $manager->id;
        $departmentId = $manager->department_id;
        $branchId     = $user->branch_id;

        $query->where(function ($builder) use ($employeeRelation, $managerId, $departmentId, $branchId): void {
            if ($employeeRelation) {
                $builder->whereHas($employeeRelation, function ($employeeQuery) use ($managerId, $departmentId, $branchId): void {
                    $employeeQuery->where('manager_id', $managerId)
                        ->orWhere('id', $managerId);

                    if ($departmentId) {
                        $employeeQuery->orWhere('department_id', $departmentId);
                    }

                    if ($branchId) {
                        $employeeQuery->orWhereHas('user', function ($userQuery) use ($branchId): void {
                            $userQuery->where('branch_id', $branchId);
                        });
                    }
                });

                return;
            }

            $builder->where('manager_id', $managerId)
                ->orWhere('id', $managerId);

            if ($departmentId) {
                $builder->orWhere('department_id', $departmentId);
            }

            if ($branchId) {
                $builder->orWhereHas('user', function ($userQuery) use ($branchId): void {
                    $userQuery->where('branch_id', $branchId);
                });
            }
        });
    }

    private function shouldScopeToManagedEmployees(Request $request): bool
    {
        $user = $request->user();
        if (!$user || $this->userIsCompanyAdmin($request)) {
            return false;
        }

        return $user->can('employees:view')
            || $user->can('employees:export')
            || $user->can('attendance:view')
            || $user->can('attendance:manage_settings')
            || $user->can('attendance:approve')
            || $user->can('leaves:view')
            || $user->can('leaves:manage_settings')
            || $user->can('leaves:approve')
            || $user->can('payroll:view')
            || $user->can('payroll:manage_settings')
            || $user->can('performance:view')
            || $user->can('performance:manage_settings')
            || $user->can('reports:view')
            || $user->can('reports:export')
            || $user->can('reports:manage_settings')
            || $user->can('employees:view');
    }

    private function userIsCompanyAdmin(Request $request): bool
    {
        return (bool) $request->user()?->hasAnyRole([\App\Models\User::ROLE_SUPER_ADMIN, \App\Models\User::ROLE_COMPANY_ADMIN]);
    }
}
