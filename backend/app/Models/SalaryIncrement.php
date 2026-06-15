<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalaryIncrement extends Model
{
    protected $fillable = [
        'employee_id',
        'effective_date',
        'old_salary',
        'new_salary',
        'reason',
        'notes',
    ];

    protected $casts = [
        'effective_date'    => 'date',
        'old_salary'        => 'float',
        'new_salary'        => 'float',
        'increment_percent' => 'float',
    ];

    protected $appends = ['increment_percent_computed'];

    public function getIncrementPercentComputedAttribute(): float
    {
        if (!$this->old_salary) return 0;
        return round(($this->new_salary - $this->old_salary) / $this->old_salary * 100, 2);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
