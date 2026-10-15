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
    public const MISSING_STATUSES = [self::STATUS_MISSING_CHECK_IN, self::STATUS_MISSING_CHECK_OUT];
    public const ALL_STATUSES = ['present', 'absent', 'leave', 'late', self::STATUS_MISSING_CHECK_IN, self::STATUS_MISSING_CHECK_OUT];

    protected $fillable = [
        'employee_id',
        'check_in',
        'check_out',
        'date',
        'status',
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
        'shift_start_time',
        'shift_end_time',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
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
        return (new AttendanceCalculator())->isLateArrival($this, AttendancePolicy::query()->first(), $this->employee?->effectiveShift());
    }
}
