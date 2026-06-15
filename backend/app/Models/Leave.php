<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class Leave extends Model
{
    protected $fillable = [
        'employee_id',
        'type',
        'from_date',
        'to_date',
        'half_day',
        'reason',
        'status',
        'approval_step',
    ];

    protected $casts = [
        'half_day'      => 'boolean',
        'approval_step' => 'integer',
    ];

    protected $appends = ['requested_days'];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function getRequestedDaysAttribute(): float
    {
        if ($this->half_day) {
            return 0.5;
        }

        return (float) (Carbon::parse($this->from_date)->diffInDays(Carbon::parse($this->to_date)) + 1);
    }
}
