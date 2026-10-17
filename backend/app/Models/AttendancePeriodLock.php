<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendancePeriodLock extends Model
{
    protected $fillable = ['company_id', 'year', 'month', 'locked_by', 'locked_at', 'reason'];

    protected $casts = ['locked_at' => 'datetime'];

    public function locker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }
}
