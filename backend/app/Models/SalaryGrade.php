<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalaryGrade extends Model
{
    protected $fillable = [
        'company_id',
        'name',
        'min_salary',
        'max_salary',
        'basic_percent',
        'hra_percent',
        'transport_allowance',
        'other_allowance',
        'notes',
    ];

    protected $casts = [
        'min_salary'          => 'float',
        'max_salary'          => 'float',
        'basic_percent'       => 'float',
        'hra_percent'         => 'float',
        'transport_allowance' => 'float',
        'other_allowance'     => 'float',
    ];

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class, 'salary_grade_id');
    }
}
