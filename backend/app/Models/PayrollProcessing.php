<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollProcessing extends Model
{
    protected $fillable = [
        'month',
        'year',
        'status',
        'processed_at',
        'notes',
    ];

    protected $casts = [
        'month' => 'integer',
        'year' => 'integer',
        'processed_at' => 'datetime',
    ];
}
