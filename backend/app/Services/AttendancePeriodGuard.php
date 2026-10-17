<?php

namespace App\Services;

use App\Exceptions\AttendancePeriodLockedException;
use App\Models\AttendancePeriodLock;
use App\Models\AttendancePeriodReopening;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\PayrollProcessing;
use Carbon\Carbon;

/**
 * Decides whether an employee's attendance for a date may still change.
 *
 * A month is closed for an employee when any of these is true:
 *  - an admin locked the month for the company (attendance_period_locks). Only unlocking opens it again;
 *  - the company's payroll run for the month is marked completed;
 *  - the employee already has a payroll record for the month (any status but cancelled), because the
 *    payroll figures were worked out from that month's attendance. Delete the draft payroll (or
 *    cancel it) to reopen the month for that person, or open a time-limited, audited reopening
 *    (attendance_period_reopenings) when the payroll cannot be removed, e.g. it is already paid.
 *
 * Nothing is cached: the answer must follow a payroll, lock or reopening change immediately.
 */
class AttendancePeriodGuard
{
    public const REASON_MANUAL = 'manual';
    public const REASON_PROCESSING = 'processing';
    public const REASON_PAYROLL = 'payroll';

    /** @return array{type: string, message: string}|null */
    public function lockFor(?int $employeeId, mixed $date): ?array
    {
        if (!$employeeId || !$date) {
            return null;
        }

        $day = Carbon::parse($date);
        $companyId = Employee::withoutGlobalScopes()->whereKey($employeeId)->value('company_id');
        $label = $day->format('F Y');

        if ($companyId) {
            if (AttendancePeriodLock::query()->where('company_id', $companyId)->where('year', $day->year)->where('month', $day->month)->exists()) {
                return ['type' => self::REASON_MANUAL, 'message' => "Attendance for {$label} is locked. Ask an administrator to unlock the period before changing it."];
            }
        }

        $closure = null;
        if ($companyId && PayrollProcessing::withoutGlobalScopes()->where('company_id', $companyId)
            ->where('year', $day->year)->where('month', $day->month)->where('status', 'completed')->exists()) {
            $closure = ['type' => self::REASON_PROCESSING, 'message' => "Payroll for {$label} is completed, so its attendance is closed."];
        }

        if (!$closure) {
            $payroll = Payroll::query()
                ->where('employee_id', $employeeId)->where('year', $day->year)->where('month', $day->month)
                ->where('status', '!=', Payroll::STATUS_CANCELLED)
                ->first(['id', 'status']);
            if ($payroll) {
                $closure = ['type' => self::REASON_PAYROLL, 'message' => "Payroll for {$label} has already been run for this employee ({$payroll->status}), so its attendance is closed. Delete or cancel the payroll record, or ask an administrator to reopen the period with a reason."];
            }
        }

        if ($closure && $companyId && AttendancePeriodReopening::query()->active()
            ->where('company_id', $companyId)->where('year', $day->year)->where('month', $day->month)
            ->where(fn ($q) => $q->whereNull('employee_id')->orWhere('employee_id', $employeeId))
            ->exists()) {
            return null;
        }

        return $closure;
    }

    /** @throws AttendancePeriodLockedException */
    public function assertOpen(?int $employeeId, mixed $date): void
    {
        $lock = $this->lockFor($employeeId, $date);
        if ($lock) {
            throw new AttendancePeriodLockedException($lock['message']);
        }
    }
}
