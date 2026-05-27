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
}

