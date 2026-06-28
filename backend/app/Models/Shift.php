<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class Shift extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id',
        'name',
        'start_time',
        'end_time',
        'grace_minutes',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
