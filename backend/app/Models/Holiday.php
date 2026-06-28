<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id',
        'name',
        'holiday_date',
        'is_optional',
    ];

    protected $casts = [
        'holiday_date' => 'date',
        'is_optional' => 'boolean',
    ];
}
