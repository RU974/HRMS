<?php

namespace App\Models;

use App\Models\AttendancePolicy;
use App\Services\AttendanceCalculator;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    protected $fillable = [
        'employee_id',
        'check_in',
        'check_out',
        'date',
        'status',
        'source',
        'biometric_device_id',
        'notes',
        'correction_status',
        'correction_request_notes',
        'correction_requested_at',
        'correction_response_notes',
        'correction_reviewed_at',
    ];

    protected $casts = [
        'check_in' => 'datetime',
        'check_out' => 'datetime',
        'date' => 'date',
        'correction_requested_at' => 'datetime',
        'correction_reviewed_at' => 'datetime',
    ];

    protected $appends = [
        'overtime_hours',
        'duration_hours',
        'is_early_arrival',
        'is_late_arrival',
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

    public function getIsEarlyArrivalAttribute(): bool
    {
        return (new AttendanceCalculator())->isEarlyArrival($this, $this->employee?->shift);
    }

    public function getIsLateArrivalAttribute(): bool
    {
        return (new AttendanceCalculator())->isLateArrival($this, AttendancePolicy::query()->first(), $this->employee?->shift);
    }
}
