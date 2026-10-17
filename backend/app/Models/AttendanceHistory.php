<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceHistory extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'company_id', 'attendance_id', 'employee_id', 'date', 'action',
        'changes', 'user_id', 'source', 'reason', 'created_at',
    ];

    protected $casts = [
        'date' => 'date',
        'changes' => 'array',
        'created_at' => 'datetime',
    ];

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
