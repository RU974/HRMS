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

    /**
     * Build the check-out datetime for a record whose date is the shift-start date.
     * A check-out at or before the check-in clock time belongs to the next calendar
     * day (night shifts, e.g. in 19:30 → out 05:10).
     */
    public function resolveCheckOut(string $date, ?string $checkInDateTime, string $time): string
    {
        $out = Carbon::parse(sprintf('%s %s', $date, $time));

        if ($checkInDateTime) {
            $in = Carbon::parse($checkInDateTime);
            while ($out->lessThanOrEqualTo($in)) {
                $out->addDay();
            }
        }

        return $out->toDateTimeString();
    }

    public function isOvernightShift(?Shift $shift): bool
    {
        if (!$shift || !$shift->start_time || !$shift->end_time) {
            return false;
        }

        if ($shift->continues_after_midnight) {
            return true;
        }

        return Carbon::parse($shift->end_time)->lessThanOrEqualTo(Carbon::parse($shift->start_time));
    }

    /**
     * Status for a record that just got a check-in. A half-day leave keeps its half_day
     * status (the other half is leave); someone who turns up on a full approved leave day
     * is simply present / late, the leave link is cleaned up by the leave sync.
     */
    public function statusForPunch(Attendance $attendance, ?AttendancePolicy $policy, ?Shift $shift, string $checkInDateTime, string $fallbackStatus = 'present'): string
    {
        if ($attendance->isLeaveLinked()) {
            if ($attendance->status === Attendance::STATUS_HALF_DAY) {
                return Attendance::STATUS_HALF_DAY;
            }
            if ($attendance->status === 'leave') {
                $fallbackStatus = 'present';
            }
        }

        return $this->deriveStatusFromCheckIn($policy, $shift, $checkInDateTime, $fallbackStatus, !$attendance->isLeaveLinked());
    }

    /**
     * @param  bool  $applyRules  false for a day that belongs to an approved leave: the late-arrival
     *                            half-day / absent rules do not apply to it.
     */
    public function deriveStatusFromCheckIn(?AttendancePolicy $policy, ?Shift $shift, string $checkInDateTime, string $fallbackStatus = 'present', bool $applyRules = true): string
    {
        if (!$policy) {
            return $fallbackStatus;
        }

        // Only statuses an admin chooses by hand (absent / leave / half day) survive a recompute.
        // "late" and the missing-punch flags are derived from the punches, so they are
        // re-evaluated; otherwise a record could never leave "late" once it had it.
        if ($policy->allow_manual_status_override && in_array($fallbackStatus, Attendance::MANUAL_STATUSES, true)) {
            return $fallbackStatus;
        }

        $checkIn = Carbon::parse($checkInDateTime);
        $threshold = $this->getLateThreshold($checkIn, $policy, $shift);

        if (!$checkIn->greaterThan($threshold)) {
            return 'present';
        }

        return ($applyRules ? $this->lateArrivalRuleStatus($checkIn, $threshold, $policy) : null) ?? 'late';
    }

    /** Half day / absent because the person arrived too long after the late cut-off. */
    private function lateArrivalRuleStatus(Carbon $checkIn, Carbon $threshold, AttendancePolicy $policy): ?string
    {
        $beyond = fn (?int $minutes) => $minutes !== null && $checkIn->greaterThan($threshold->copy()->addMinutes($minutes));

        if ($beyond($policy->absent_after_late_minutes)) {
            return 'absent';
        }

        return $beyond($policy->half_day_after_late_minutes) ? Attendance::STATUS_HALF_DAY : null;
    }

    private const SEVERITY = ['present' => 0, 'late' => 1, Attendance::STATUS_HALF_DAY => 2, 'absent' => 3];

    /**
     * The half day / absent status the policy gives a record from its own punches (late arrival
     * and, once checked out, hours worked), or null when the policy has no objection.
     */
    public function ruleStatus(Attendance $attendance, ?AttendancePolicy $policy, ?Shift $shift): ?string
    {
        if (!$policy || !$attendance->check_in || $attendance->isLeaveLinked()) {
            return null;
        }

        try {
            $checkIn = Carbon::parse($attendance->check_in);
            $threshold = $this->getLateThreshold($checkIn, $policy, $shift);
            $late = $checkIn->greaterThan($threshold) ? $this->lateArrivalRuleStatus($checkIn, $threshold, $policy) : null;
        } catch (\Exception $e) {
            $late = null;
        }

        return $this->worse($late, $this->hoursRuleStatus($attendance, $policy));
    }

    /** The more severe of two statuses (null counts as nothing). */
    private function worse(?string $a, ?string $b): ?string
    {
        return (self::SEVERITY[$a ?? 'present'] ?? 0) >= (self::SEVERITY[$b ?? 'present'] ?? 0) ? $a : $b;
    }

    /**
     * Minimum-hours ladder for a closed day: at least the full-day hours is a normal day; below it
     * is a half day, and below the half-day mark an absence when the company counts short days
     * as absent. With only the full-day hours set, a short day is flagged but keeps its status.
     */
    private function hoursRuleStatus(Attendance $attendance, AttendancePolicy $policy): ?string
    {
        if ($policy->full_day_hours === null || $policy->half_day_hours === null
            || !$attendance->check_in || !$attendance->check_out) {
            return null;
        }

        $hours = $this->getDurationHours($attendance);
        if ($hours >= (float) $policy->full_day_hours) {
            return null;
        }

        return ($hours < (float) $policy->half_day_hours && $policy->count_short_as_absent)
            ? 'absent'
            : Attendance::STATUS_HALF_DAY;
    }

    /** Worked fewer hours than a full day requires (flag only; see hoursRuleStatus for the status effect). */
    public function isShortHours(Attendance $attendance, ?AttendancePolicy $policy): bool
    {
        if (!$policy || $policy->full_day_hours === null || !$attendance->check_in || !$attendance->check_out
            || $attendance->isLeaveLinked() || in_array($attendance->status, ['absent', 'leave'], true)) {
            return false;
        }

        return $this->getDurationHours($attendance) < (float) $policy->full_day_hours;
    }

    /** Left before the shift end (less the grace), or before the fixed cut-off when there is no shift. */
    public function isEarlyLeave(Attendance $attendance, ?AttendancePolicy $policy, ?Shift $shift): bool
    {
        if (!$policy || !$policy->early_leave_enabled || !$attendance->check_in || !$attendance->check_out
            || $attendance->isLeaveLinked() || in_array($attendance->status, ['absent', 'leave'], true)) {
            return false;
        }

        try {
            $out = Carbon::parse($attendance->check_out);

            if ($shift && $shift->end_time) {
                $end = Carbon::parse($this->dateString($attendance) . ' ' . $shift->end_time);
                if ($shift->start_time && $end->lessThanOrEqualTo(Carbon::parse($this->dateString($attendance) . ' ' . $shift->start_time))) {
                    $end->addDay();
                }

                return $out->lessThan($end->subMinutes((int) $policy->early_leave_grace_minutes));
            }

            if ($policy->early_leave_before_time) {
                return $out->lessThan(Carbon::parse($out->toDateString() . ' ' . $policy->early_leave_before_time));
            }
        } catch (\Exception $e) {
            return false;
        }

        return false;
    }

    /**
     * Status a record should have from its own punches. Hand-set absent/leave rows with no
     * punches are kept; everything else is derived, so a corrected or re-graced record
     * leaves "late" / "missing" as soon as the punches say it should.
     */
    public function recomputeStatus(Attendance $attendance, ?AttendancePolicy $policy, ?Shift $shift): string
    {
        $current = (string) $attendance->status;

        if ($attendance->status_reason === Attendance::REASON_MANUAL && $attendance->check_in && ($policy?->allow_manual_status_override ?? true)) {
            return $current;
        }

        if (!$attendance->check_in) {
            if ($attendance->check_out) {
                return Attendance::STATUS_MISSING_CHECK_IN;
            }

            return $current ?: 'present';
        }

        if (!$attendance->check_out && $current === Attendance::STATUS_MISSING_CHECK_OUT) {
            return $current; // still open past the shift end; the late punch will clear it
        }

        // Leave and hand-picked half-day rows keep their status; an "absent" row that has punches
        // was clearly wrong. A half day / absence the policy worked out itself is re-evaluated.
        $derivedByPolicy = $attendance->status_reason === Attendance::REASON_POLICY;
        $fallback = (!$derivedByPolicy && in_array($current, ['leave', Attendance::STATUS_HALF_DAY], true)) ? $current : 'present';

        if ($attendance->isLeaveLinked()) {
            return $this->statusForPunch(
                $attendance,
                $policy,
                $shift,
                Carbon::parse($attendance->check_in)->toDateTimeString(),
                $fallback
            );
        }

        $status = $this->deriveStatusFromCheckIn(
            $policy,
            $shift,
            Carbon::parse($attendance->check_in)->toDateTimeString(),
            $fallback
        );

        // A status kept because an admin chose it is not second-guessed by the hours rule.
        $keptByHand = $status === $fallback && $fallback !== 'present';
        if (!$keptByHand) {
            $hours = $this->hoursRuleStatus($attendance, $policy);
            $status = $this->worse($status, $hours) ?? $status;
        }

        return $status;
    }

    public function getLateThreshold(Carbon $checkIn, AttendancePolicy $policy, ?Shift $shift): Carbon
    {
        if ($shift && $shift->start_time) {
            $threshold = Carbon::parse($checkIn->toDateString() . ' ' . $shift->start_time);
            // Night shift: a check-in after midnight (before the shift's end time)
            // belongs to the shift that started the previous evening.
            if ($this->isOvernightShift($shift)
                && $checkIn->format('H:i:s') < Carbon::parse($shift->end_time)->format('H:i:s')) {
                $threshold->subDay();
            }
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