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
        'notice_period_days',
        'allow_half_day',
        'encashable',
    ];

    protected $casts = [
        'is_paid'                  => 'boolean',
        'is_active'                => 'boolean',
        'allow_half_day'           => 'boolean',
        'encashable'               => 'boolean',
        'accrual_amount'           => 'integer',
        'carry_forward_days'       => 'integer',
        'max_balance'              => 'integer',
        'required_approval_levels' => 'integer',
        'min_request_days'         => 'integer',
        'max_request_days'         => 'integer',
        'notice_period_days'       => 'integer',
    ];
}
