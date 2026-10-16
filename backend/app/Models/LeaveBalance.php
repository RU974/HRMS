<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    protected $fillable = [
        'employee_id',
        'leave_type_id',
        'period_type',
        'period_start',
        'period_end',
        'accrued_days',
        'used_days',
        'pending_days',
        'carried_forward_days',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'accrued_days' => 'integer',
        'used_days' => 'float',
        'pending_days' => 'float',
        'carried_forward_days' => 'integer',
    ];

    protected $appends = [
        'remaining_days',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function getRemainingDaysAttribute(): float
    {
        return max(
            ($this->accrued_days + $this->carried_forward_days) - ($this->used_days + $this->pending_days),
            0
        );
    }
}
