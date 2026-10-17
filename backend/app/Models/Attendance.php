<?php

namespace App\Models;

use App\Exceptions\AttendancePeriodLockedException;
use App\Models\AttendancePolicy;
use App\Services\AttendanceCalculator;
use App\Services\AttendancePeriodGuard;
use App\Services\ScheduledShift;
use App\Services\ShiftResolver;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

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
        'edited_by',
        'edited_at',
        'edited_source',
    ];

    /** Fields whose change is written to attendance_histories and stamps edited_by / edited_at. */
    public const TRACKED_FIELDS = [
        'employee_id', 'leave_id', 'date', 'check_in', 'check_out', 'shift_id', 'status', 'status_reason',
        'source', 'biometric_device_id', 'work_from_home', 'notes', 'correction_status',
        'correction_request_notes', 'correction_proposed_check_in', 'correction_proposed_check_out',
        'correction_response_notes',
    ];

    /** Who/what is writing right now (set by recordingAs); null means "the signed-in user, else the system". */
    private static ?string $changeSource = null;

    private static ?string $changeReason = null;

    protected $casts = [
        'edited_at' => 'datetime',
        'check_in' => 'datetime',
        'check_out' => 'datetime',
        'date' => 'date',
        'shift_snapshot' => 'array',
        'work_from_home' => 'boolean',
        'correction_requested_at' => 'datetime',
        'correction_reviewed_at' => 'datetime',
    ];

    // The editor relation is only read for its name (edited_by_name); serialising a whole User per row
    // would run role queries for every record in a list.
    protected $hidden = ['shift_snapshot', 'editor'];

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
        'edited_by_name',
    ];

    protected static function booted(): void
    {
        // A closed month (admin lock or payroll already run) accepts no change at all, from any
        // writer: screens, imports, the biometric agent, leave sync, recalculation. Background
        // writers go through saveIfOpen()/deleteIfOpen() and skip the row instead of failing.
        static::saving(function (Attendance $attendance) {
            if ($attendance->exists && !$attendance->isDirty()) {
                return;
            }
            $guard = app(AttendancePeriodGuard::class);
            $guard->assertOpen($attendance->employee_id, $attendance->date);
            if ($attendance->exists && $attendance->isDirty(['date', 'employee_id'])) {
                $guard->assertOpen($attendance->getOriginal('employee_id'), $attendance->getOriginal('date'));
            }
        });
        static::deleting(function (Attendance $attendance) {
            app(AttendancePeriodGuard::class)->assertOpen($attendance->employee_id, $attendance->date);
        });

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

        // "Edited by / at": the last person (or background job) that changed something that matters.
        static::saving(function (Attendance $attendance) {
            if (!$attendance->exists || $attendance->isDirty(self::TRACKED_FIELDS)) {
                $attendance->edited_by = self::currentActorId();
                $attendance->edited_at = now();
                $attendance->edited_source = self::currentSource();
            }
        });

        static::created(fn (Attendance $a) => $a->writeHistory('created', array_filter(
            array_map(fn ($v) => [null, $v], $a->trackedValues($a->getAttributes())),
            fn ($pair) => $pair[1] !== null
        )));
        static::updated(function (Attendance $a) {
            $changes = [];
            foreach (array_intersect(self::TRACKED_FIELDS, array_keys($a->getChanges())) as $field) {
                $old = self::normalise($field, $a->getRawOriginal($field));
                $new = self::normalise($field, $a->getAttributes()[$field] ?? null);
                if ($old !== $new) {
                    $changes[$field] = [$old, $new];
                }
            }
            if ($changes !== []) {
                $a->writeHistory('updated', $changes);
            }
        });
        static::deleted(fn (Attendance $a) => $a->writeHistory('deleted', array_filter(
            array_map(fn ($v) => [$v, null], $a->trackedValues($a->getAttributes())),
            fn ($pair) => $pair[0] !== null
        )));
    }

    /**
     * Run attendance writes on behalf of a named source (and optional reason) so the history says
     * who changed a record: 'biometric', 'leave', 'auto_absent', 'recalculation', 'schedule', 'import', ...
     */
    public static function recordingAs(string $source, callable $callback, ?string $reason = null): mixed
    {
        [$previousSource, $previousReason] = [self::$changeSource, self::$changeReason];
        self::$changeSource = $source;
        self::$changeReason = $reason;
        try {
            return $callback();
        } finally {
            [self::$changeSource, self::$changeReason] = [$previousSource, $previousReason];
        }
    }

    /** Save for a background writer: a closed month is skipped (logged) instead of raising. */
    public function saveIfOpen(?string $source = null): bool
    {
        try {
            return (bool) ($source ? self::recordingAs($source, fn () => $this->save()) : $this->save());
        } catch (AttendancePeriodLockedException) {
            Log::info('Attendance change skipped: period closed', ['employee_id' => $this->employee_id, 'date' => $this->date?->toDateString()]);

            return false;
        }
    }

    public function deleteIfOpen(?string $source = null): bool
    {
        try {
            return (bool) ($source ? self::recordingAs($source, fn () => $this->delete()) : $this->delete());
        } catch (AttendancePeriodLockedException) {
            Log::info('Attendance delete skipped: period closed', ['employee_id' => $this->employee_id, 'date' => $this->date?->toDateString()]);

            return false;
        }
    }

    private static function currentActorId(): ?int
    {
        try {
            return request()?->user()?->id;
        } catch (\Throwable) {
            return null;
        }
    }

    private static function currentSource(): string
    {
        return self::$changeSource ?? (self::currentActorId() ? 'manual' : 'system');
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function trackedValues(array $attributes): array
    {
        $values = [];
        foreach (self::TRACKED_FIELDS as $field) {
            $values[$field] = self::normalise($field, $attributes[$field] ?? null);
        }

        return $values;
    }

    private static function normalise(string $field, mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        $value = (string) $value;

        return $field === 'date' ? substr($value, 0, 10) : $value;
    }

    /** @param array<string, array{0: ?string, 1: ?string}> $changes */
    private function writeHistory(string $action, array $changes): void
    {
        AttendanceHistory::create([
            'company_id' => Employee::withoutGlobalScopes()->whereKey($this->employee_id)->value('company_id'),
            'attendance_id' => $this->id,
            'employee_id' => $this->employee_id,
            'date' => self::normalise('date', $this->getAttributes()['date'] ?? null) ?? now()->toDateString(),
            'action' => $action,
            'changes' => $changes,
            'user_id' => self::currentActorId(),
            'source' => self::currentSource(),
            'reason' => self::$changeReason,
            'created_at' => now(),
        ]);
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'edited_by');
    }

    /** Name of whoever edited last; only filled where the list eager-loads `editor` (never queries per row). */
    public function getEditedByNameAttribute(): ?string
    {
        return $this->relationLoaded('editor') ? $this->editor?->name : null;
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
