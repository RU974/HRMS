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

    /**
     * Signed hour difference computed via epoch timestamps.
     *
     * Carbon 3 (required by Laravel 12) removed the floatDiffInHours() helper
     * that this class previously used — every call threw a BadMethodCallException
     * that was swallowed by the surrounding try/catch, so overtime and duration
     * silently evaluated to 0.0 for all employees. Timestamp arithmetic is
     * identical on Carbon 2 and 3 and makes the sign convention explicit:
     * positive when $to is after $from.
     */
    private function signedHoursBetween(Carbon $from, Carbon $to): float
    {
        return ($to->getTimestamp() - $from->getTimestamp()) / 3600.0;
    }

    /**
     * Attendance::$date is cast to a Carbon instance, so string-concatenating it
     * with a time (e.g. $attendance->date . ' ' . $shift->end_time) stringifies
     * it to a full "Y-m-d H:i:s" and produces a malformed "<date> 00:00:00 <time>"
     * string — Carbon::parse() throws on that, which the callers' try/catch
     * silently swallowed into 0.0, zeroing out overtime for every attendance
     * record. Normalize to a plain Y-m-d string before building the datetime.
     */
    private function dateString(Attendance $attendance): string
    {
        return Carbon::parse($attendance->date)->toDateString();
    }

    public function calculateOvertimeHours(Attendance $attendance, ?Shift $shift): float
    {
        if (!$attendance->check_out || !$shift || !$shift->end_time) {
            return 0.0;
        }

        try {
            $actualOut    = Carbon::parse($attendance->check_out);
            $scheduledEnd = Carbon::parse($this->dateString($attendance) . ' ' . $shift->end_time);

            // Overnight shift: scheduled end falls on the next calendar day
            // (e.g. 22:00 → 06:00). If the shift ends at or before it starts,
            // roll the scheduled end forward one day so the comparison is valid.
            if ($shift->start_time) {
                $scheduledStart = Carbon::parse($this->dateString($attendance) . ' ' . $shift->start_time);
                if ($scheduledEnd->lessThanOrEqualTo($scheduledStart)) {
                    $scheduledEnd->addDay();
                }
            }

            $overtime = $this->signedHoursBetween($scheduledEnd, $actualOut);

            if ($overtime <= 0) {
                // Left at or before scheduled end — no overtime.
                return 0.0;
            }

            return round(min($overtime, self::MAX_OVERTIME_HOURS), 2);
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
            $checkIn  = Carbon::parse($attendance->check_in);
            $checkOut = Carbon::parse($attendance->check_out);

            $hours = $this->signedHoursBetween($checkIn, $checkOut);

            // Negative means corrupted data (check_out before check_in) — treat as zero
            // rather than returning an absolute value that would hide the corruption.
            return $hours > 0 ? round($hours, 2) : 0.0;
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
            $scheduledStart = Carbon::parse($this->dateString($attendance) . ' ' . $shift->start_time);
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