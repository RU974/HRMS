<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CandidateStageHistory extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id',
        'candidate_id',
        'from_stage',
        'to_stage',
        'changed_by',
        'reason',
        'from_label',
        'to_label',
        'from_pipeline_stage_id',
        'to_pipeline_stage_id',
    ];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by')->select(['id', 'name']);
    }
}
