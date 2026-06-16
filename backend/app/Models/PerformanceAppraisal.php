<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PerformanceAppraisal extends Model
{
    protected $fillable = [
        'employee_id',
        'reviewer_id',
        'template_id',
        'cycle',
        'overall_score',
        'status',
        'strengths',
        'improvements',
    ];

    protected $casts = [
        'overall_score' => 'integer',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(PerformanceReviewTemplate::class, 'template_id');
    }
}
