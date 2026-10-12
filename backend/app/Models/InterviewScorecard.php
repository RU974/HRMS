<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterviewScorecard extends Model
{
    use HasCompany;

    public const RECOMMENDATIONS = ['hire', 'no_hire', 'hold'];

    /** Interview result implied by a scorecard recommendation. */
    public const RESULT_BY_RECOMMENDATION = [
        'hire' => 'pass',
        'no_hire' => 'fail',
        'hold' => 'hold',
    ];

    protected $fillable = [
        'company_id',
        'interview_id',
        'submitted_by',
        'rating',
        'recommendation',
        'strengths',
        'concerns',
    ];

    public function interview(): BelongsTo
    {
        return $this->belongsTo(Interview::class);
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by')->select(['id', 'name']);
    }
}
