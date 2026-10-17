<?php

namespace App\Http\Controllers;

use App\Models\AttendanceHistory;
use App\Models\AttendancePeriodLock;
use App\Models\AttendancePeriodReopening;
use App\Models\Payroll;
use App\Models\PayrollProcessing;
use App\Services\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * Closing attendance months and reading the company-wide change history.
 * A month is also closed on its own once payroll has run (see AttendancePeriodGuard).
 */
class AttendancePeriodController extends Controller
{
    // GET /attendance/period-locks?year=2026 — the 12 months with what (if anything) closes each.
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $year = (int) ($request->validate(['year' => 'nullable|integer|min:2000|max:2100'])['year'] ?? now()->year);
        $companyId = $this->companyId($request);

        $locks = AttendancePeriodLock::with('locker:id,name')
            ->where('company_id', $companyId)->where('year', $year)->get()->keyBy('month');
        $completed = PayrollProcessing::withoutGlobalScopes()
            ->where('company_id', $companyId)->where('year', $year)->where('status', 'completed')
            ->pluck('month')->flip();
        $payrolls = Payroll::query()
            ->where('year', $year)->where('status', '!=', Payroll::STATUS_CANCELLED)
            ->whereHas('employee', fn ($q) => $q->withoutGlobalScopes()->where('company_id', $companyId))
            ->selectRaw('month, COUNT(*) as total')->groupBy('month')->pluck('total', 'month');

        $months = [];
        for ($month = 1; $month <= 12; $month++) {
            $lock = $locks->get($month);
            $months[] = [
                'year' => $year,
                'month' => $month,
                'locked' => $lock !== null,
                'locked_by' => $lock?->locker ? ['id' => $lock->locker->id, 'name' => $lock->locker->name] : null,
                'locked_at' => $lock?->locked_at?->toIso8601String(),
                'reason' => $lock?->reason,
                'payroll_completed' => $completed->has($month),
                'payroll_records' => (int) ($payrolls[$month] ?? 0),
            ];
        }

        return $this->ok($months);
    }

    // POST /attendance/period-locks { month, year, reason? }
    public function lock(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000|max:2100',
            'reason' => 'nullable|string|max:500',
        ]);
        $companyId = $this->companyId($request);

        if (Carbon::create($validated['year'], $validated['month'], 1)->startOfMonth()->isFuture()) {
            return $this->fail('A month that has not started yet cannot be locked.', 422);
        }

        $lock = AttendancePeriodLock::firstOrCreate(
            ['company_id' => $companyId, 'year' => $validated['year'], 'month' => $validated['month']],
            ['locked_by' => $request->user()?->id, 'locked_at' => now(), 'reason' => $validated['reason'] ?? null]
        );

        if ($lock->wasRecentlyCreated) {
            app(AuditLogService::class)->recordRequest(
                $request, 'attendance_period_locked', 'attendance',
                sprintf('Locked attendance for %s', Carbon::create($validated['year'], $validated['month'], 1)->format('F Y')),
                null, ['year' => $validated['year'], 'month' => $validated['month'], 'reason' => $validated['reason'] ?? null]
            );
        }

        return $this->ok($lock->load('locker:id,name'), 'Attendance period locked.', $lock->wasRecentlyCreated ? 201 : 200);
    }

    // POST /attendance/period-locks/unlock { month, year, reason }
    public function unlock(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000|max:2100',
            'reason' => 'required|string|max:500',
        ]);
        $companyId = $this->companyId($request);

        $lock = AttendancePeriodLock::where('company_id', $companyId)
            ->where('year', $validated['year'])->where('month', $validated['month'])->first();
        if (!$lock) {
            return $this->fail('This period is not locked by an administrator.', 404);
        }

        $lock->delete();
        app(AuditLogService::class)->recordRequest(
            $request, 'attendance_period_unlocked', 'attendance',
            sprintf('Unlocked attendance for %s', Carbon::create($validated['year'], $validated['month'], 1)->format('F Y')),
            ['year' => $validated['year'], 'month' => $validated['month'], 'locked_reason' => $lock->reason],
            ['reason' => $validated['reason']]
        );

        return $this->ok(null, 'Attendance period unlocked. Payroll that was already run for it still keeps its records closed.');
    }

    // GET /attendance/period-reopenings — active reopenings plus the last 30 days of closed ones.
    public function reopenings(Request $request)
    {
        $this->authorizeReopening($request);

        return $this->ok(
            AttendancePeriodReopening::with(['opener:id,name', 'employee:id,name'])
                ->where('company_id', $this->companyId($request))
                ->where(fn ($q) => $q->where('created_at', '>=', now()->subDays(30)))
                ->orderByDesc('id')->get()
                ->map(fn (AttendancePeriodReopening $r) => $r->toArray() + ['active' => $r->closed_at === null && $r->expires_at->isFuture()])
        );
    }

    // POST /attendance/period-reopenings { month, year, reason, employee_id?, hours? }
    // Opens a month that payroll closed, for one employee or all, for a limited time. Needs both
    // attendance:manage_settings and payroll:manage_settings. A manual lock stays until it is unlocked.
    public function reopen(Request $request)
    {
        $this->authorizeReopening($request);
        $validated = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000|max:2100',
            'reason' => 'required|string|min:5|max:500',
            'employee_id' => 'nullable|integer',
            'hours' => 'nullable|integer|min:1|max:72',
        ]);
        $companyId = $this->companyId($request);

        if (!empty($validated['employee_id'])) {
            $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);
        }

        $reopening = AttendancePeriodReopening::create([
            'company_id' => $companyId,
            'employee_id' => $validated['employee_id'] ?? null,
            'year' => $validated['year'],
            'month' => $validated['month'],
            'reason' => $validated['reason'],
            'opened_by' => $request->user()?->id,
            'opened_at' => now(),
            'expires_at' => now()->addHours((int) ($validated['hours'] ?? 24)),
        ]);

        app(AuditLogService::class)->recordRequest(
            $request, 'attendance_period_reopened', 'attendance',
            sprintf('Reopened closed attendance for %s (%s)', Carbon::create($validated['year'], $validated['month'], 1)->format('F Y'),
                $reopening->employee_id ? 'employee #' . $reopening->employee_id : 'all employees'),
            null, $reopening->only(['employee_id', 'year', 'month', 'reason', 'expires_at'])
        );

        return $this->ok($reopening, 'Period reopened until ' . $reopening->expires_at->toDateTimeString() . '. Payroll already run for it is not recalculated automatically.', 201);
    }

    // POST /attendance/period-reopenings/{id}/close — end a reopening early.
    public function closeReopening(Request $request, int $id)
    {
        $this->authorizeReopening($request);
        $reopening = AttendancePeriodReopening::where('company_id', $this->companyId($request))->findOrFail($id);
        if ($reopening->closed_at === null) {
            $reopening->update(['closed_at' => now(), 'closed_by' => $request->user()?->id]);
            app(AuditLogService::class)->recordRequest(
                $request, 'attendance_period_reclosed', 'attendance',
                sprintf('Closed the reopening of %s again', Carbon::create($reopening->year, $reopening->month, 1)->format('F Y')),
                $reopening->only(['employee_id', 'year', 'month']), null
            );
        }

        return $this->ok($reopening->fresh(), 'Period closed again.');
    }

    private function authorizeReopening(Request $request): void
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $this->authorizePermission($request, 'payroll:manage_settings', 'Reopening a payroll-closed period also needs payroll settings access.');
    }

    // GET /attendance/history — change log for the whole company (includes deleted records).
    public function history(Request $request)
    {
        $this->authorizePermission($request, 'attendance:manage_settings');
        $request->validate([
            'employee_id' => 'nullable|integer',
            'user_id' => 'nullable|integer',
            'action' => 'nullable|in:created,updated,deleted',
            'source' => 'nullable|string|max:32',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
        ]);

        $query = AttendanceHistory::with(['actor:id,name', 'employee:id,name,employee_number']);
        $this->scopeToCompany($request, $query);
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        foreach (['employee_id', 'user_id', 'action', 'source'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->input($filter));
            }
        }
        if ($request->filled('date_from')) {
            $query->whereDate('date', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('date', '<=', $request->date_to);
        }

        return $this->ok($query->orderByDesc('created_at')->orderByDesc('id')->paginate($this->perPage($request, 25)));
    }

    private function companyId(Request $request): string
    {
        $companyId = $request->user()?->company_id;
        abort_unless($companyId, 422, 'Your account is not linked to a company.');

        return (string) $companyId;
    }
}
