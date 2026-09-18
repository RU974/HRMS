<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Deduction extends Model
{
    protected $fillable = [
        'employee_id',
        'payroll_id',
        'loan_advance_id',
        'title',
        'amount',
        'type',
        'effective_date',
        'notes',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function payroll(): BelongsTo
    {
        return $this->belongsTo(Payroll::class);
    }

    public function loanAdvance(): BelongsTo
    {
        return $this->belongsTo(LoanAdvance::class);
    }
}

