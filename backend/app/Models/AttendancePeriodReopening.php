<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendancePeriodReopening extends Model
{
    protected $fillable = [
        'company_id', 'employee_id', 'year', 'month', 'reason',
        'opened_by', 'opened_at', 'expires_at', 'closed_at', 'closed_by',
    ];

    protected $casts = ['opened_at' => 'datetime', 'expires_at' => 'datetime', 'closed_at' => 'datetime'];

    /** Not closed by hand and not past its expiry. */
    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('closed_at')->where('expires_at', '>', now());
    }

    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
