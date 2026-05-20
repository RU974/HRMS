<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    protected $fillable = [
        'name',
        'holiday_date',
        'is_optional',
    ];

    protected $casts = [
        'holiday_date' => 'date',
        'is_optional' => 'boolean',
    ];
}
