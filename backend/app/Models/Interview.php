<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Interview extends Model
{
    use HasCompany;

    protected $fillable = [
        'candidate_id',
        'company_id',
        'interviewer_id',
        'created_by',
        'interviewer_name',
        'interview_type',
        'scheduled_at',
        'duration_minutes',
        'location',
        'meeting_link',
        'status',
        'cancel_reason',
        'scorecard_reminded_at',
        'result',
        'feedback',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'scorecard_reminded_at' => 'datetime',
        'duration_minutes' => 'integer',
    ];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function interviewer(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'interviewer_id');
    }

    public function rescheduleRequests(): HasMany
    {
        return $this->hasMany(InterviewRescheduleRequest::class);
    }

    public function scorecards(): HasMany
    {
        return $this->hasMany(InterviewScorecard::class);
    }

    public function endsAt()
    {
        return $this->scheduled_at?->copy()->addMinutes($this->duration_minutes ?: 60);
    }
}
