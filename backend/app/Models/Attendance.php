<?php

namespace App\Models;

use App\Models\AttendancePolicy;
use App\Services\AttendanceCalculator;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    public const STATUS_MISSING_CHECK_IN  = 'missing_check_in';
    public const STATUS_MISSING_CHECK_OUT = 'missing_check_out';
    public const STATUS_HALF_DAY = 'half_day';
    public const MISSING_STATUSES = [self::STATUS_MISSING_CHECK_IN, self::STATUS_MISSING_CHECK_OUT];
    public const ALL_STATUSES = ['present', 'absent', 'leave', 'late', self::STATUS_HALF_DAY, self::STATUS_MISSING_CHECK_IN, self::STATUS_MISSING_CHECK_OUT];

    /** Statuses an admin picks by hand; they are never recomputed from the punches. */
    public const MANUAL_STATUSES = ['absent', 'leave', self::STATUS_HALF_DAY];

    /** status_reason value for a half day / absence the attendance policy worked out from the punches. */
    public const REASON_POLICY = 'policy';

    /** status_reason value for a status a person chose over what the policy would give; it is not re-judged. */
    public const REASON_MANUAL = 'manual';

    protected $fillable = [
        'employee_id',
        'leave_id',
        'check_in',
        'check_out',
        'date',
        'status',
        'status_reason',
        'source',
        'biometric_device_id',
        'work_from_home',
        'notes',
        'correction_status',
        'correction_request_notes',
        'correction_proposed_check_in',
        'correction_proposed_check_out',
        'correction_requested_at',
        'correction_response_notes',
        'correction_reviewed_at',
    ];

    protected $casts = [
        'check_in' => 'datetime',
        'check_out' => 'datetime',
        'date' => 'date',
        'work_from_home' => 'boolean',
        'correction_requested_at' => 'datetime',
        'correction_reviewed_at' => 'datetime',
    ];

    protected $appends = [
        'overtime_hours',
        'duration_hours',
        'is_early_arrival',
        'is_late_arrival',
        'is_early_leave',
        'is_short_hours',
        'shift_start_time',
        'shift_end_time',
    ];

    protected static function booted(): void
    {
        // Remember whether a half day / absence came from the policy or from a person, so a
        // later correction of the punches re-evaluates the first kind and keeps the second.
        static::saving(function (Attendance $attendance) {
            // A person's override stays until they (or a correction) change the status again.
            if ($attendance->status_reason === self::REASON_MANUAL
                && ($attendance->isDirty('status_reason') || !$attendance->isDirty('status'))) {
                return;
            }

            if (!in_array($attendance->status, ['half_day', 'absent'], true) || !$attendance->check_in || $attendance->isLeaveLinked()) {
                $attendance->status_reason = null;

                return;
            }

            $employee = $attendance->employee;
            $derived = (new AttendanceCalculator())->ruleStatus(
                $attendance,
                AttendancePolicy::forEmployee($employee),
                $employee?->effectiveShift()
            );
            $attendance->status_reason = $derived === $attendance->status ? self::REASON_POLICY : null;
        });
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leave(): BelongsTo
    {
        return $this->belongsTo(Leave::class);
    }

    /** True for a row written because of an approved leave (full day or half day). */
    public function isLeaveLinked(): bool
    {
        return $this->leave_id !== null;
    }

    public function getOvertimeHoursAttribute(): float
    {
        return (new AttendanceCalculator())->calculateOvertimeHours($this, $this->employee?->shift);
    }

    public function getDurationHoursAttribute(): float
    {
        return (new AttendanceCalculator())->getDurationHours($this);
    }

    public function getShiftStartTimeAttribute(): ?string
    {
        $time = $this->employee?->shift?->start_time;

        return $time ? substr((string) $time, 0, 5) : null;
    }

    public function getShiftEndTimeAttribute(): ?string
    {
        $time = $this->employee?->shift?->end_time;

        return $time ? substr((string) $time, 0, 5) : null;
    }

    public function getIsEarlyArrivalAttribute(): bool
    {
        return (new AttendanceCalculator())->isEarlyArrival($this, $this->employee?->shift);
    }

    public function getIsLateArrivalAttribute(): bool
    {
        return (new AttendanceCalculator())->isLateArrival($this, AttendancePolicy::forEmployee($this->employee), $this->employee?->effectiveShift());
    }

    public function getIsEarlyLeaveAttribute(): bool
    {
        return (new AttendanceCalculator())->isEarlyLeave($this, AttendancePolicy::forEmployee($this->employee), $this->employee?->effectiveShift());
    }

    public function getIsShortHoursAttribute(): bool
    {
        return (new AttendanceCalculator())->isShortHours($this, AttendancePolicy::forEmployee($this->employee));
    }
}
