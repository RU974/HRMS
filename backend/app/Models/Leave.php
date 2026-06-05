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
        'status',
        'approval_step',
    ];

    protected $casts = [
        'approval_step' => 'integer',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function getRequestedDaysAttribute(): int
    {
        return Carbon::parse($this->from_date)->diffInDays(Carbon::parse($this->to_date)) + 1;
    }
}
