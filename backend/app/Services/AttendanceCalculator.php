<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendancePolicy;
use App\Models\Shift;
use Carbon\Carbon;

class AttendanceCalculator
{
    public function normalizeCheckTime(string $date, string $time): string
    {
        return Carbon::parse(sprintf('%s %s', $date, $time))->toDateTimeString();
    }

    public function deriveStatusFromCheckIn(?AttendancePolicy $policy, ?Shift $shift, string $checkInDateTime, string $fallbackStatus = 'present'): string
    {
        if (!$policy) {
            return $fallbackStatus;
        }

        if ($policy->allow_manual_status_override && $fallbackStatus !== 'present') {
            return $fallbackStatus;
        }

        $checkIn = Carbon::parse($checkInDateTime);
        $threshold = $this->getLateThreshold($checkIn, $policy, $shift);

        return $checkIn->greaterThan($threshold) ? 'late' : 'present';
    }

    public function getLateThreshold(Carbon $checkIn, AttendancePolicy $policy, ?Shift $shift): Carbon
    {
        if ($shift && $shift->start_time) {
            $threshold = Carbon::parse($checkIn->toDateString() . ' ' . $shift->start_time);
            $grace = (int) ($shift->grace_minutes ?? 0);
            if ($grace > 0) {
                $threshold = $threshold->addMinutes($grace);
            }
            return $threshold;
        }

        return Carbon::parse($checkIn->toDateString() . ' ' . $policy->late_after_time);
    }

    // Hard cap prevents corrupted check_out timestamps (e.g. midnight fallback) from
    // producing implausibly large overtime values that inflate payroll.
    private const MAX_OVERTIME_HOURS = 4.0;

    public function calculateOvertimeHours(Attendance $attendance, ?Shift $shift): float
    {
        if (!$attendance->check_out || !$shift || !$shift->end_time) {
            return 0.0;
        }

        try {
            $actualOut = Carbon::parse($attendance->check_out);
            $scheduledEnd = Carbon::parse($attendance->date . ' ' . $shift->end_time);
            $overtime = $actualOut->floatDiffInHours($scheduledEnd);
            // floatDiffInHours returns absolute value; negative when actualOut < scheduledEnd (early departure)
            if ($actualOut->lessThan($scheduledEnd)) {
                return 0.0;
            }
            return min($overtime, self::MAX_OVERTIME_HOURS);
        } catch (\Exception $e) {
            return 0.0;
        }
    }

    public function getDurationHours(Attendance $attendance): float
    {
        if (!$attendance->check_in || !$attendance->check_out) {
            return 0.0;
        }

        try {
            return Carbon::parse($attendance->check_in)->floatDiffInHours(Carbon::parse($attendance->check_out));
        } catch (\Exception $e) {
            return 0.0;
        }
    }

    public function isEarlyArrival(Attendance $attendance, ?Shift $shift): bool
    {
        if (!$attendance->check_in || !$shift || !$shift->start_time) {
            return false;
        }

        try {
            $checkIn = Carbon::parse($attendance->check_in);
            $scheduledStart = Carbon::parse($attendance->date . ' ' . $shift->start_time);
            return $checkIn->lessThan($scheduledStart);
        } catch (\Exception $e) {
            return false;
        }
    }

    public function isLateArrival(Attendance $attendance, ?AttendancePolicy $policy, ?Shift $shift): bool
    {
        if (!$attendance->check_in || !$policy) {
            return false;
        }

        try {
            $checkIn = Carbon::parse($attendance->check_in);
            $threshold = $this->getLateThreshold($checkIn, $policy, $shift);
            return $checkIn->greaterThan($threshold);
        } catch (\Exception $e) {
            return false;
        }
    }
}
