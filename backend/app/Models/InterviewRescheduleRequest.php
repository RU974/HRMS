<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterviewRescheduleRequest extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id', 'candidate_id', 'interview_id', 'note', 'proposed_times',
        'status', 'resolved_by', 'resolution_note', 'resolved_at',
    ];

    protected $casts = [
        'proposed_times' => 'array',
        'resolved_at' => 'datetime',
    ];

    public function interview(): BelongsTo
    {
        return $this->belongsTo(Interview::class);
    }

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }
}
