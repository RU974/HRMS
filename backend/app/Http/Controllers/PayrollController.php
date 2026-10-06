<?php

namespace App\Http\Controllers;

use App\Jobs\GeneratePayrollJob;
use App\Models\BackgroundRun;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\PayrollProcessing;
use App\Models\User;
use App\Services\PayrollNotificationService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll
    //  Filters: employee_id, status, month, year, page
    // ──────────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view');

        $query = Payroll::with(['employee'])
            ->orderByDesc('year')
            ->orderByDesc('month');

        // Multi-tenant scope
        $this->scopeToCompany($request, $query, 'employee');

        // Department-manager / HR scoping from base Controller
        $this->applyManagedEmployeeScope($request, $query, 'employee');

        if ($request->filled('employee_id')) {
            $query->where('employee_id', (int) $request->query('employee_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('month')) {
            $query->where('month', (int) $request->query('month'));
        }
        if ($request->filled('year')) {
            $query->where('year', (int) $request->query('year'));
        }

        return $this->ok($query->paginate(15));
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/payroll
    //  Manually create a single payroll record
    // ──────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'employee_id'    => 'required|exists:employees,id',
            'month'          => 'required|integer|min:1|max:12',
            'year'           => 'required|integer|min:2000',
            'base_salary'    => 'required|numeric|min:0',
            'allowances'     => 'nullable|numeric|min:0',
            'bonus'          => 'nullable|numeric|min:0',
            'overtime_hours' => 'nullable|numeric|min:0',
            'overtime_pay'   => 'nullable|numeric|min:0',
            'deductions'     => 'nullable|numeric|min:0',
            'tax'            => 'nullable|numeric|min:0',
            'payment_date'   => 'nullable|date',
            'status'         => 'nullable|in:' . implode(',', Payroll::lifecycleStates()),
        ]);

        $this->assertEmployeeInCompany($request, (int) $validated['employee_id']);

        $validated['status'] = $validated['status'] ?? Payroll::STATUS_DRAFT;
        $validated['allowances'] = $validated['allowances'] ?? 0;
        $validated['bonus'] = $validated['bonus'] ?? 0;
        $validated['overtime_hours'] = $validated['overtime_hours'] ?? 0;
        $validated['overtime_pay'] = $validated['overtime_pay'] ?? 0;
        $validated['deductions'] = $validated['deductions'] ?? 0;
        $validated['tax'] = $validated['tax'] ?? 0;
        // net_salary is always derived server-side rather than trusted from the
        // client — manual entry previously let base/allowances/bonus/deductions/tax
        // and net_salary disagree with each other with nothing to catch it.
        $validated['net_salary'] = $this->computeNetSalary($validated);

        try {
            $payroll = Payroll::create($validated);
        } catch (QueryException $e) {
            if ($this->isDuplicateError($e)) {
                return $this->fail(
                    'A payroll record for this employee, month, and year already exists.',
                    422,
                    ['employee_id' => ['Duplicate payroll entry for this period.']]
                );
            }
            throw $e;
        }

        return $this->ok($payroll->load('employee'), 'Payroll record created successfully.', 201);
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll/{id}
    // ──────────────────────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:view');

        $payroll = Payroll::with(['employee'])->findOrFail($id);
        $this->assertPayrollInCompany($request, $payroll);

        return $this->ok($payroll);
    }

    // ──────────────────────────────────────────────────────────────
    //  PUT /api/payroll/{id}
    //  Financial fields can only be edited while the record is still a
    //  draft — once it's reviewed/approved/paid, corrections must go
    //  through reject (back to draft) rather than a silent direct edit.
    //  Status itself is never set here: it only moves via approve/
    //  reject/mark-paid, so every transition is auditable.
    // ──────────────────────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $payroll = Payroll::findOrFail($id);
        $this->assertPayrollInCompany($request, $payroll);

        if ($payroll->status !== Payroll::STATUS_DRAFT) {
            return $this->fail(
                "Cannot edit a payroll record in '{$payroll->status}' status. Reject it back to draft first.",
                422
            );
        }

        $validated = $request->validate([
            'base_salary'    => 'sometimes|numeric|min:0',
            'allowances'     => 'nullable|numeric|min:0',
            'bonus'          => 'nullable|numeric|min:0',
            'overtime_hours' => 'nullable|numeric|min:0',
            'overtime_pay'   => 'nullable|numeric|min:0',
            'deductions'     => 'nullable|numeric|min:0',
            'tax'            => 'nullable|numeric|min:0',
            'payment_date'   => 'nullable|date',
        ]);

        $merged = array_merge($payroll->only([
            'base_salary', 'allowances', 'bonus', 'overtime_pay', 'deductions', 'tax',
        ]), $validated);
        $validated['net_salary'] = $this->computeNetSalary($merged);

        $payroll->update($validated);

        return $this->ok($payroll->load('employee'), 'Payroll record updated successfully.');
    }

    // ──────────────────────────────────────────────────────────────
    //  DELETE /api/payroll/{id}
    // ──────────────────────────────────────────────────────────────
    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $payroll = Payroll::findOrFail($id);
        $this->assertPayrollInCompany($request, $payroll);

        if ($payroll->status === Payroll::STATUS_PAID) {
            return $this->fail('Paid payroll records cannot be deleted.', 422);
        }

        $payroll->delete();

        return $this->ok(null, 'Payroll record deleted successfully.');
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll/employee/{employeeId}?year=2025
    // ──────────────────────────────────────────────────────────────
    public function getByEmployee(Request $request, int $employeeId)
    {
        $this->authorizePermission($request, 'payroll:view');
        $this->assertEmployeeInCompany($request, $employeeId);
        $this->authorizeManagedEmployeeAccess($request, $employeeId, 'payroll record');

        $query = Payroll::with(['employee'])
            ->where('employee_id', $employeeId)
            ->orderByDesc('year')
            ->orderByDesc('month');

        if ($request->filled('year')) {
            $query->where('year', (int) $request->query('year'));
        }

        return $this->ok($query->paginate(15));
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll/summary/monthly?month=6&year=2025
    //  Returns one summary row per status bucket for the period.
    // ──────────────────────────────────────────────────────────────
    public function getMonthlySummary(Request $request)
    {
        $this->authorizePermission($request, 'payroll:view');

        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year'  => 'required|integer|min:2000',
        ]);

        $month = (int) $request->query('month');
        $year  = (int) $request->query('year');

        $query = Payroll::query()
            ->where('month', $month)
            ->where('year', $year);

        $this->scopeToCompany($request, $query, 'employee');

        $summary = $query
            ->selectRaw('
                status,
                COUNT(*)               AS total_employees,
                SUM(base_salary)       AS total_base_salary,
                SUM(allowances)        AS total_allowances,
                SUM(bonus)             AS total_bonus,
                SUM(overtime_pay)      AS total_overtime,
                SUM(deductions)        AS total_deductions,
                SUM(tax)               AS total_tax,
                SUM(net_salary)        AS total_net_salary
            ')
            ->groupBy('status')
            ->get();

        return $this->ok($summary);
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/payroll/generate          (payroll:manage_settings)
    //  Body: { month, year, department_id? }
    //  Queues payroll generation for all eligible employees using
    //  PayrollCalculator (via GeneratePayrollJob) so a large company
    //  doesn't time out a synchronous web request. Returns a
    //  background_run id the frontend polls for progress.
    // ──────────────────────────────────────────────────────────────
    public function generatePayroll(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $validated = $request->validate([
            'month'         => 'required|integer|min:1|max:12',
            'year'          => 'required|integer|min:2000',
            'department_id' => 'nullable|exists:departments,id',
        ]);

        $month = (int) $validated['month'];
        $year  = (int) $validated['year'];

        $employeeQuery = Employee::query()
            ->where('status', 'active');

        $this->scopeToCompany($request, $employeeQuery);

        if (!empty($validated['department_id'])) {
            $employeeQuery->where('department_id', (int) $validated['department_id']);
        }

        $employeeIds = $employeeQuery->pluck('id')->all();

        $run = BackgroundRun::create([
            'type'         => BackgroundRun::TYPE_PAYROLL_GENERATE,
            'status'       => BackgroundRun::STATUS_QUEUED,
            'company_id'   => $request->user()?->company_id,
            'requested_by' => $request->user()?->id,
        ]);

        // Keep the payroll-processings batch tracker in sync with the actual
        // generation run instead of it being a disconnected manual status label.
        $processing = PayrollProcessing::firstOrNew([
            'month'      => $month,
            'year'       => $year,
            'company_id' => $request->user()?->company_id,
        ]);
        $processing->status = 'processing';
        $processing->save();

        // Dispatched sync rather than queued: this app has no supervised, always-on
        // queue worker (only a manually-started `queue:listen` in a second terminal),
        // so a queued dispatch leaves the BackgroundRun stuck at "queued" forever
        // whenever that process isn't running, and the frontend just hangs polling it.
        GeneratePayrollJob::dispatchSync($run->id, $employeeIds, $month, $year, $processing->id);

        return $this->ok(['background_run_id' => $run->id], 'Payroll generation has been queued.', 202);
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/payroll/{id}/approve      (payroll:manage_settings)
    //  Advances status: draft → reviewed → approved
    // ──────────────────────────────────────────────────────────────
    public function approvePayroll(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $payroll = Payroll::with('employee')->findOrFail($id);
        $this->assertPayrollInCompany($request, $payroll);

        $transitions = [
            Payroll::STATUS_DRAFT     => Payroll::STATUS_REVIEWED,
            Payroll::STATUS_REVIEWED  => Payroll::STATUS_APPROVED,
            Payroll::STATUS_PENDING   => Payroll::STATUS_REVIEWED,
        ];

        $next = $transitions[$payroll->status] ?? null;
        if (!$next) {
            return $this->fail("Cannot advance payroll from '{$payroll->status}' status.", 422);
        }

        $payroll->transitionTo($next);

        if ($next === Payroll::STATUS_APPROVED) {
            $payroll->update([
                'approved_by' => $request->user()?->id,
                'approved_at' => now(),
            ]);
        }

        return $this->ok($payroll->fresh('employee'), "Payroll moved to '{$next}'.");
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/payroll/{id}/reject   (payroll:manage_settings)
    //  Sends draft/reviewed/pending payroll back to draft with a reason,
    //  so a review-stage mistake doesn't require bypassing the lifecycle
    //  via a direct update(). Approved/paid records cannot be rejected —
    //  once paid, corrections need a fresh payroll adjustment instead.
    // ──────────────────────────────────────────────────────────────
    public function rejectPayroll(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $payroll = Payroll::with('employee')->findOrFail($id);
        $this->assertPayrollInCompany($request, $payroll);

        if (!in_array($payroll->status, [Payroll::STATUS_REVIEWED, Payroll::STATUS_PENDING], true)) {
            return $this->fail("Cannot reject payroll from '{$payroll->status}' status.", 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $payroll->transitionTo(Payroll::STATUS_DRAFT);
        $payroll->update([
            'rejected_at' => now(),
            'rejection_reason' => $validated['reason'],
        ]);

        return $this->ok($payroll->fresh('employee'), 'Payroll sent back to draft.');
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll/bank-export?month=6&year=2025  (payroll:manage_settings)
    //  Returns CSV-formatted bank transfer data for approved/paid payrolls
    // ──────────────────────────────────────────────────────────────
    public function bankExport(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year'  => 'required|integer|min:2000',
        ]);

        $month = (int) $request->query('month');
        $year  = (int) $request->query('year');

        $query = Payroll::with(['employee'])
            ->where('month', $month)
            ->where('year', $year)
            ->whereIn('status', [Payroll::STATUS_APPROVED, Payroll::STATUS_PAID]);

        $this->scopeToCompany($request, $query, 'employee');

        $records = $query->get();

        $rows   = ["Employee Name,Employee ID,Bank Account,Net Salary,Payment Date,Status"];
        foreach ($records as $p) {
            $name    = $p->employee?->name ?? "Employee #{$p->employee_id}";
            $account = $p->employee?->bank_account ?? '';
            $rows[]  = implode(',', [
                '"' . str_replace('"', '""', $name) . '"',
                $p->employee_id,
                '"' . $account . '"',
                number_format((float) $p->net_salary, 2, '.', ''),
                $p->payment_date ?? '',
                $p->status,
            ]);
        }

        $csv = implode("\n", $rows);

        return response($csv, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"payroll-{$year}-{$month}.csv\"",
        ]);
    }

    // ──────────────────────────────────────────────────────────────
    //  GET /api/payroll/summary-pdf?month=&year=   (payroll:manage_settings)
    //  Printable disbursement sheet for the whole period with grand total.
    // ──────────────────────────────────────────────────────────────
    public function summaryPdf(Request $request)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year'  => 'required|integer|min:2000',
        ]);

        $month = (int) $request->query('month');
        $year  = (int) $request->query('year');

        $query = Payroll::with(['employee'])
            ->where('month', $month)
            ->where('year', $year);
        $this->scopeToCompany($request, $query, 'employee');

        $records = $query->get()->sortBy(fn ($p) => $p->employee?->name ?? '')->values();

        $companyId = $request->user()?->company_id;
        $company = $companyId ? \App\Models\Company::find($companyId) : null;

        $sum = fn (string $f) => (float) $records->sum(fn ($p) => (float) ($p->{$f} ?? 0));
        $totals = [
            'base'       => $sum('base_salary'),
            'allowances' => $sum('allowances'),
            'bonus'      => $sum('bonus'),
            'overtime'   => $sum('overtime_pay'),
            'deductions' => $sum('deductions'),
            'tax'        => $sum('tax'),
            'net'        => $sum('net_salary'),
        ];

        $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('payroll.summary-pdf', [
            'companyName' => $company->name ?? config('app.name'),
            'period'      => date('F Y', mktime(0, 0, 0, $month, 1, $year)),
            'records'     => $records,
            'totals'      => $totals,
            'generatedAt' => now()->format('Y-m-d H:i'),
        ])->setPaper('a4', 'landscape');

        return response($pdf->output(), 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"payroll-summary-{$year}-" . str_pad((string) $month, 2, '0', STR_PAD_LEFT) . ".pdf\"",
        ]);
    }

    // ──────────────────────────────────────────────────────────────
    //  POST /api/payroll/{id}/mark-paid    (payroll:manage_settings)
    // ──────────────────────────────────────────────────────────────
    public function markAsPaid(Request $request, int $id)
    {
        $this->authorizePermission($request, 'payroll:manage_settings');

        $payroll = Payroll::with('employee')->findOrFail($id);
        $this->assertPayrollInCompany($request, $payroll);

        if ($payroll->status === Payroll::STATUS_PAID) {
            return $this->fail('Payroll record is already marked as paid.', 422);
        }

        if (!$payroll->transitionTo(Payroll::STATUS_PAID)) {
            return $this->fail('Could not transition payroll to paid status.', 500);
        }

        $payroll->update([
            'paid_by' => $request->user()?->id,
            'paid_at' => now(),
            // Stamp payment date if not already set
            'payment_date' => $payroll->payment_date ?: now()->toDateString(),
        ]);

        app(PayrollNotificationService::class)->notifyPaid($payroll);

        return $this->ok($payroll->fresh('employee'), 'Payroll marked as paid.');
    }

    // ──────────────────────────────────────────────────────────────
    //  Private helpers
    // ──────────────────────────────────────────────────────────────

    /**
     * Ensure the payroll's employee belongs to the requester's company.
     */
    private function assertPayrollInCompany(Request $request, Payroll $payroll): void
    {
        $this->assertEmployeeInCompany($request, (int) $payroll->employee_id);
    }

    /**
     * Derive net_salary from the other components rather than trusting a
     * client-supplied value, so a payroll record can never persist with a
     * net_salary that doesn't reconcile with its own line items.
     */
    private function computeNetSalary(array $components): float
    {
        $gross = (float) ($components['base_salary'] ?? 0)
            + (float) ($components['allowances'] ?? 0)
            + (float) ($components['bonus'] ?? 0)
            + (float) ($components['overtime_pay'] ?? 0);

        $net = $gross - (float) ($components['deductions'] ?? 0) - (float) ($components['tax'] ?? 0);

        return round(max(0, $net), 2);
    }

    /**
     * Detect unique-constraint violations (duplicate employee+month+year).
     */
    private function isDuplicateError(QueryException $e): bool
    {
        $msg = strtolower($e->getMessage());
        return str_contains($msg, 'unique') || str_contains($msg, 'duplicate');
    }
}