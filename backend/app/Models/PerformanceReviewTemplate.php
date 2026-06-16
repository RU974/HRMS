<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PerformanceReviewTemplate extends Model
{
    protected $fillable = [
        'company_id',
        'name',
        'scale_min',
        'scale_max',
        'criteria',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'scale_min' => 'integer',
        'scale_max' => 'integer',
        'criteria' => 'array',
        'is_active' => 'boolean',
    ];

    public function appraisals(): HasMany
    {
        return $this->hasMany(PerformanceAppraisal::class, 'template_id');
    }
}
