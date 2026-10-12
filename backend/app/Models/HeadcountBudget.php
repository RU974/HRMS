<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HeadcountBudget extends Model
{
    use HasCompany;

    protected $fillable = ['company_id', 'department_id', 'fiscal_year', 'approved_headcount', 'approved_budget'];

    protected $casts = [
        'fiscal_year' => 'integer',
        'approved_headcount' => 'integer',
        'approved_budget' => 'decimal:2',
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }
}
