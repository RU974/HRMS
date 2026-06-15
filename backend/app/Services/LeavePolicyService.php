<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Leave;
use App\Models\LeaveBalance;
use App\Models\LeaveBlackout;
use App\Models\LeaveType;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class LeavePolicyService
{
    public function calculateRequestedDays(string $fromDate, string $toDate): int
    {
        return Carbon::parse($fromDate)->diffInDays(Carbon::parse($toDate)) + 1;
    }

    public function findLeaveTypeByName(string $type): ?LeaveType
    {
        return LeaveType::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($type)])
            ->first();
    }

    public function resolveAccrualFrequency(LeaveType $leaveType): string
    {
        return $leaveType->accrual_frequency ?: 'yearly';
    }

    public function resolvePeriodStart(LeaveType $leaveType, Carbon $date): Carbon
    {
        return match ($this->resolveAccrualFrequency($leaveType)) {
            'monthly' => $date->copy()->firstOfMonth(),
            default => $date->copy()->startOfYear(),
        };
    }

    public function resolvePeriodEnd(LeaveType $leaveType, Carbon $periodStart): Carbon
    {
        return match ($this->resolveAccrualFrequency($leaveType)) {
            'monthly' => $periodStart->copy()->endOfMonth(),
            default => $periodStart->copy()->endOfYear(),
        };
    }

    public function calculateAccruedDays(LeaveType $leaveType): int
    {
        if ($this->resolveAccrualFrequency($leaveType) === 'monthly') {
            return $leaveType->accrual_amount > 0
                ? (int) $leaveType->accrual_amount
                : (int) ceil($leaveType->default_days / 12);
        }

        return $leaveType->accrual_amount > 0
            ? (int) $leaveType->accrual_amount
            : (int) $leaveType->default_days;
    }

    public function calculateMaximumBalance(LeaveType $leaveType): int
    {
        if ($leaveType->max_balance > 0) {
            return (int) $leaveType->max_balance;
        }

        return $this->calculateAccruedDays($leaveType) + (int) $leaveType->carry_forward_days;
    }

    public function calculateDaysInSegment(string $rangeStart, string $rangeEnd, Carbon $segmentStart, Carbon $segmentEnd): int
    {
        $fromDate = Carbon::parse($rangeStart)->max($segmentStart);
        $toDate = Carbon::parse($rangeEnd)->min($segmentEnd);

        if ($toDate->lt($fromDate)) {
            return 0;
        }

        return $fromDate->diffInDays($toDate) + 1;
    }

    public function segmentsForLeave(Leave $leave): array
    {
        $leaveType = $this->findLeaveTypeByName($leave->type);
        if (!$leaveType) {
            return [];
        }

        $fromDate = Carbon::parse($leave->from_date);
        $toDate = Carbon::parse($leave->to_date);
        $segments = [];
        $current = $fromDate->copy();

        while ($current->lte($toDate)) {
            $periodStart = $this->resolvePeriodStart($leaveType, $current);
            $periodEnd = $this->resolvePeriodEnd($leaveType, $periodStart);
            $segmentEnd = $current->copy()->min($periodEnd);
            $segments[] = [
                'leave_type' => $leaveType,
                'period_type' => $this->resolveAccrualFrequency($leaveType),
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'days' => $current->diffInDays($segmentEnd) + 1,
            ];
            $current = $segmentEnd->copy()->addDay();
        }

        return $segments;
    }

    public function segmentsForRange(Employee $employee, string $type, string $fromDate, string $toDate): array
    {
        $leaveType = $this->findLeaveTypeByName($type);
        if (!$leaveType) {
            return [];
        }

        $leave = new Leave([
            'employee_id' => $employee->id,
            'type' => $type,
            'from_date' => $fromDate,
            'to_date' => $toDate,
        ]);

        return $this->segmentsForLeave($leave);
    }

    public function getBalance(Employee $employee, LeaveType $leaveType, Carbon $date, ?Leave $excludeLeave = null): LeaveBalance
    {
        $periodStart = $this->resolvePeriodStart($leaveType, $date);
        $periodType = $this->resolveAccrualFrequency($leaveType);

        $existingBalance = LeaveBalance::query()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('period_type', $periodType)
            ->whereDate('period_start', $periodStart)
            ->first();

        if ($existingBalance) {
            return $existingBalance;
        }

        $periodEnd = $this->resolvePeriodEnd($leaveType, $periodStart);
        $accruedDays = $this->calculateAccruedDays($leaveType);
        $carriedForward = $this->calculateCarryForward($employee, $leaveType, $periodStart, $periodType);
        if ($leaveType->max_balance > 0) {
            $carriedForward = min($carriedForward, max(0, $leaveType->max_balance - $accruedDays));
        }

        return LeaveBalance::create([
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'period_type' => $periodType,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'accrued_days' => $accruedDays,
            'carried_forward_days' => $carriedForward,
            'used_days' => $this->sumLeaveDays($employee, $leaveType, $periodStart, $periodEnd, 'approved', $excludeLeave),
            'pending_days' => $this->sumLeaveDays($employee, $leaveType, $periodStart, $periodEnd, 'pending', $excludeLeave),
        ]);
    }

    public function refreshBalance(LeaveBalance $balance): LeaveBalance
    {
        $periodStart = Carbon::parse($balance->period_start);
        $leaveType = $balance->leaveType;
        if (!$leaveType) {
            return $balance;
        }

        $periodEnd = $this->resolvePeriodEnd($leaveType, $periodStart);
        $balance->accrued_days = $this->calculateAccruedDays($leaveType);
        $balance->carried_forward_days = $this->calculateCarryForward($balance->employee, $leaveType, $periodStart, $balance->period_type);
        if ($leaveType->max_balance > 0) {
            $balance->carried_forward_days = min($balance->carried_forward_days, max(0, $leaveType->max_balance - $balance->accrued_days));
        }
        $balance->used_days = $this->sumLeaveDays($balance->employee, $leaveType, $periodStart, $periodEnd, 'approved');
        $balance->pending_days = $this->sumLeaveDays($balance->employee, $leaveType, $periodStart, $periodEnd, 'pending');
        $balance->save();

        return $balance;
    }

    public function calculateCarryForward(Employee $employee, LeaveType $leaveType, Carbon $periodStart, string $periodType): int
    {
        if ((int) $leaveType->carry_forward_days <= 0) {
            return 0;
        }

        $previousPeriodStart = match ($periodType) {
            'monthly' => $periodStart->copy()->subMonthNoOverflow()->firstOfMonth(),
            default => $periodStart->copy()->subYear()->startOfYear(),
        };

        $previousBalance = LeaveBalance::query()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('period_type', $periodType)
            ->where('period_start', $previousPeriodStart->toDateString())
            ->first();

        if (!$previousBalance) {
            $previousBalance = $this->getBalance($employee, $leaveType, $previousPeriodStart);
        }

        return min((int) $leaveType->carry_forward_days, $previousBalance->remaining_days);
    }

    public function sumLeaveDays(Employee $employee, LeaveType $leaveType, Carbon $periodStart, Carbon $periodEnd, string $status, ?Leave $excludeLeave = null): int
    {
        $query = Leave::query()
            ->where('employee_id', $employee->id)
            ->whereRaw('LOWER(type) = ?', [mb_strtolower($leaveType->name)])
            ->where('status', $status)
            ->whereDate('from_date', '<=', $periodEnd)
            ->whereDate('to_date', '>=', $periodStart);

        if ($excludeLeave && $excludeLeave->id) {
            $query->where('id', '<>', $excludeLeave->id);
        }

        return $query->get()
            ->sum(function (Leave $leave) use ($periodStart, $periodEnd): int {
                return $this->calculateDaysInSegment($leave->from_date, $leave->to_date, $periodStart, $periodEnd);
            });
    }

    public function validateLeaveRequest(Leave $leave, bool $ignorePendingReservations = false): void
    {
        $leaveType = $this->findLeaveTypeByName($leave->type);
        if (!$leaveType) {
            return;
        }

        // Half-day validation
        if ($leave->half_day && !$leaveType->allow_half_day) {
            throw new RuntimeException(sprintf('Half-day leave is not allowed for %s.', $leaveType->name));
        }

        $requestedDays = $leave->half_day ? 0.5 : $this->calculateRequestedDays($leave->from_date, $leave->to_date);

        if (!$leave->half_day && (int) $leaveType->min_request_days > 0 && $requestedDays < $leaveType->min_request_days) {
            throw new RuntimeException(sprintf('Leave requests for %s must be at least %d day(s).', $leaveType->name, $leaveType->min_request_days));
        }

        if (!$leave->half_day && (int) $leaveType->max_request_days > 0 && $requestedDays > $leaveType->max_request_days) {
            throw new RuntimeException(sprintf('Leave requests for %s cannot exceed %d day(s).', $leaveType->name, $leaveType->max_request_days));
        }

        // Advance notice period enforcement
        if ((int) $leaveType->notice_period_days > 0) {
            $daysUntilStart = (int) Carbon::today()->diffInDays(Carbon::parse($leave->from_date), false);
            if ($daysUntilStart < (int) $leaveType->notice_period_days) {
                throw new RuntimeException(sprintf(
                    'Leave requests for %s must be submitted at least %d day(s) in advance.',
                    $leaveType->name,
                    $leaveType->notice_period_days
                ));
            }
        }

        // Blackout date check
        $blackout = LeaveBlackout::where(function ($q) use ($leaveType): void {
            $q->whereNull('leave_type_id')->orWhere('leave_type_id', $leaveType->id);
        })
            ->where('start_date', '<=', $leave->to_date)
            ->where('end_date', '>=', $leave->from_date)
            ->first();

        if ($blackout) {
            throw new RuntimeException(sprintf(
                'Leave dates overlap with a restricted period: %s (%s – %s).',
                $blackout->name,
                $blackout->start_date->toDateString(),
                $blackout->end_date->toDateString()
            ));
        }

        foreach ($this->segmentsForLeave($leave) as $segment) {
            $balance = $this->getBalance($leave->employee, $segment['leave_type'], $segment['period_start'], $leave);
            if ($ignorePendingReservations) {
                $availableDays = max(($balance->accrued_days + $balance->carried_forward_days) - $balance->used_days, 0);
                if ($availableDays < $segment['days']) {
                    throw new RuntimeException(sprintf('Insufficient %s leave balance for %s period starting %s.', $segment['leave_type']->name, $segment['period_type'], $segment['period_start']->toDateString()));
                }
                continue;
            }

            if ($balance->remaining_days < $segment['days']) {
                throw new RuntimeException(sprintf('Insufficient %s leave balance for %s period starting %s.', $segment['leave_type']->name, $segment['period_type'], $segment['period_start']->toDateString()));
            }
        }
    }

    public function reservePendingLeave(Leave $leave, bool $ignorePendingReservations = false): void
    {
        $leaveType = $this->findLeaveTypeByName($leave->type);
        if (!$leaveType) {
            return;
        }

        $allowReservation = $leave->status === 'pending' || (
            $leave->status === 'approved'
            && (int) $leaveType->required_approval_levels > 1
        );

        if (!$allowReservation) {
            return;
        }

        $this->validateLeaveRequest($leave, $ignorePendingReservations);

        foreach ($this->segmentsForLeave($leave) as $segment) {
            $balance = $this->getBalance($leave->employee, $segment['leave_type'], $segment['period_start'], $leave);
            $balance->pending_days += $segment['days'];
            $balance->save();
        }
    }

    public function releaseLeaveReservation(Leave $leave, string $status = null): void
    {
        $leaveType = $this->findLeaveTypeByName($leave->type);
        if (!$leaveType) {
            return;
        }

        $originalStatus = $status ?? $leave->status;
        foreach ($this->segmentsForLeave($leave) as $segment) {
            $balance = $this->getBalance($leave->employee, $segment['leave_type'], $segment['period_start']);
            if ($originalStatus === 'approved') {
                $balance->used_days = max(0, $balance->used_days - $segment['days']);
            } else {
                $balance->pending_days = max(0, $balance->pending_days - $segment['days']);
            }
            $balance->save();
        }
    }

    public function finalizeLeaveApproval(Leave $leave): void
    {
        $leaveType = $this->findLeaveTypeByName($leave->type);
        if (!$leaveType) {
            return;
        }

        $required = max(1, (int) $leaveType->required_approval_levels);
        $leave->approval_step++;
        if ($leave->approval_step <= $required) {
            $leave->status = 'pending';
            $leave->save();
            return;
        }

        foreach ($this->segmentsForLeave($leave) as $segment) {
            $balance = $this->getBalance($leave->employee, $segment['leave_type'], $segment['period_start']);
            $balance->pending_days = max(0, $balance->pending_days - $segment['days']);
            $balance->used_days += $segment['days'];
            $balance->save();
        }

        $leave->status = 'approved';
        $leave->save();
    }

    public function adjustPendingReservation(Leave $leave, array $originalSegments): void
    {
        $leaveType = $this->findLeaveTypeByName($leave->type);
        if (!$leaveType) {
            return;
        }

        foreach ($originalSegments as $segment) {
            $balance = $this->getBalance($leave->employee, $segment['leave_type'], $segment['period_start']);
            $balance->pending_days = max(0, $balance->pending_days - $segment['days']);
            $balance->save();
        }

        $this->reservePendingLeave($leave);
    }

    public function buildBalanceSummary(Employee $employee, LeaveType $leaveType, Carbon $date): LeaveBalance
    {
        return $this->getBalance($employee, $leaveType, $date);
    }
}
