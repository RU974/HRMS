<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoanAdvance extends Model
{
    protected $fillable = [
        'employee_id',
        'company_id',
        'title',
        'amount',
        'outstanding_balance',
        'emi_amount',
        'start_date',
        'end_date',
        'status',
        'notes',
    ];

    protected $casts = [
        'amount'              => 'float',
        'outstanding_balance' => 'float',
        'emi_amount'          => 'float',
        'start_date'          => 'date',
        'end_date'            => 'date',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
