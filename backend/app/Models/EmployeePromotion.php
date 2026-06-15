<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeePromotion extends Model
{
    protected $fillable = [
        'employee_id',
        'type',
        'from_designation',
        'to_designation',
        'from_department',
        'to_department',
        'from_salary',
        'to_salary',
        'effective_date',
        'notes',
    ];

    protected $casts = [
        'effective_date' => 'date',
        'from_salary' => 'decimal:2',
        'to_salary' => 'decimal:2',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
