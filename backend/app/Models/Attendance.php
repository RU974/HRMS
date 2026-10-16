<?php

namespace App\Models;

use App\Models\AttendancePolicy;
use App\Services\AttendanceCalculator;
use App\Services\ScheduledShift;
use App\Services\ShiftResolver;
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
        'shift_id',
        'shift_snapshot',
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
        'shift_snapshot' => 'array',
        'work_from_home' => 'boolean',
        'correction_requested_at' => 'datetime',
        'correction_reviewed_at' => 'datetime',
    ];

    protected $hidden = ['shift_snapshot'];

    private ?ScheduledShift $scheduledMemo = null;

    /** @var array<string, mixed>|null the snapshot $scheduledMemo was built from */
    private ?array $scheduledMemoOf = null;

    protected $appends = [
        'overtime_hours',
        'duration_hours',
        'is_early_arrival',
        'is_late_arrival',
        'is_early_leave',
        'is_short_hours',
        'shift_start_time',
        'shift_end_time',
        'shift_name',
        'shift_source',
        'is_scheduled_off',
    ];

    protected static function booted(): void
    {
        // Remember whether a half day / absence came from the policy or from a person, so a
        // later correction of the punches re-evaluates the first kind and keeps the second.
        static::saving(function (Attendance $attendance) {
            // The shift the day was judged against is frozen on the record the first time it is
            // saved (and again if the record moves to another day or person), so changing a shift,
            // roster or default later never re-judges a day that already happened.
            if ($attendance->employee_id && $attendance->date
                && ($attendance->shift_snapshot === null || $attendance->isDirty(['date', 'employee_id']))) {
                $attendance->captureShift();
            }

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
                $attendance->judgingShift()
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

    /** Freeze the shift the employee is scheduled on for this record's date. */
    public function captureShift(?ScheduledShift $schedule = null): void
    {
        $employee = $this->employee;
        $schedule ??= $employee ? app(ShiftResolver::class)->on($employee, $this->date) : null;
        if (!$schedule) {
            return;
        }

        $this->shift_id = $schedule->shift?->id;
        $this->shift_snapshot = $schedule->toSnapshot();
    }

    /**
     * What the employee was scheduled to do on this record's day: read from the frozen snapshot, or
     * (for a record that has none yet) worked out from today's roster without saving it.
     */
    public function scheduledShift(): ScheduledShift
    {
        // Several appended attributes ask for this per row; build it once per snapshot.
        $snapshot = $this->shift_snapshot;
        if ($snapshot && $this->scheduledMemo !== null && $this->scheduledMemoOf === $snapshot) {
            return $this->scheduledMemo;
        }

        $stored = ScheduledShift::fromSnapshot($snapshot);
        if ($stored) {
            $this->scheduledMemo = $stored;
            $this->scheduledMemoOf = $snapshot;

            return $stored;
        }

        $employee = $this->employee;

        return $employee && $this->date
            ? app(ShiftResolver::class)->on($employee, $this->date)
            : new ScheduledShift(null, true, ScheduledShift::SOURCE_NONE);
    }

    /** The shift (department grace applied) this day is judged against. */
    public function judgingShift(): ?Shift
    {
        return $this->scheduledShift()->shift;
    }

    public function getOvertimeHoursAttribute(): float
    {
        return (new AttendanceCalculator())->calculateOvertimeHours($this, $this->judgingShift());
    }

    public function getDurationHoursAttribute(): float
    {
        return (new AttendanceCalculator())->getDurationHours($this);
    }

    public function getShiftStartTimeAttribute(): ?string
    {
        $time = $this->judgingShift()?->start_time;

        return $time ? substr((string) $time, 0, 5) : null;
    }

    public function getShiftNameAttribute(): ?string
    {
        return $this->judgingShift()?->name;
    }

    public function getShiftSourceAttribute(): string
    {
        return $this->scheduledShift()->source;
    }

    /** The day was a rest day (weekly off or day off in a roster) for this employee. */
    public function getIsScheduledOffAttribute(): bool
    {
        return !$this->scheduledShift()->isWorkingDay;
    }

    public function getShiftEndTimeAttribute(): ?string
    {
        $time = $this->judgingShift()?->end_time;

        return $time ? substr((string) $time, 0, 5) : null;
    }

    public function getIsEarlyArrivalAttribute(): bool
    {
        return (new AttendanceCalculator())->isEarlyArrival($this, $this->judgingShift());
    }

    public function getIsLateArrivalAttribute(): bool
    {
        return (new AttendanceCalculator())->isLateArrival($this, AttendancePolicy::forEmployee($this->employee), $this->judgingShift());
    }

    public function getIsEarlyLeaveAttribute(): bool
    {
        return (new AttendanceCalculator())->isEarlyLeave($this, AttendancePolicy::forEmployee($this->employee), $this->judgingShift());
    }

    public function getIsShortHoursAttribute(): bool
    {
        return (new AttendanceCalculator())->isShortHours($this, AttendancePolicy::forEmployee($this->employee));
    }
}
