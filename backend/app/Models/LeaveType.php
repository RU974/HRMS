<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    protected $fillable = [
        'name',
        'default_days',
        'is_paid',
        'is_active',
        'accrual_frequency',
        'accrual_amount',
        'carry_forward_days',
        'max_balance',
        'required_approval_levels',
        'min_request_days',
        'max_request_days',
    ];

    protected $casts = [
        'is_paid' => 'boolean',
        'is_active' => 'boolean',
        'accrual_amount' => 'integer',
        'carry_forward_days' => 'integer',
        'max_balance' => 'integer',
        'required_approval_levels' => 'integer',
        'min_request_days' => 'integer',
        'max_request_days' => 'integer',
    ];
}
