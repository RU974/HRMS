<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeBankAccount extends Model
{
    public const ACCOUNT_TYPES = ['savings', 'current', 'salary'];

    protected $fillable = [
        'employee_id',
        'company_id',
        'account_holder_name',
        'bank_name',
        'branch_name',
        'account_number',
        'iban',
        'swift_code',
        'routing_code',
        'account_type',
        'notes',
    ];

    protected $casts = [
        'account_number' => 'encrypted',
        'iban'           => 'encrypted',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
