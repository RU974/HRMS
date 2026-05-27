<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Candidate extends Model
{
    protected $fillable = [
        'job_opening_id',
        'full_name',
        'email',
        'phone',
        'resume_path',
        'source',
        'stage',
        'rating',
        'status',
        'applied_at',
        'notes',
        'onboarding_status',
        'onboarding_start_date',
        'onboarding_notes',
    ];

    protected $casts = [
        'applied_at' => 'date',
        'onboarding_start_date' => 'date',
    ];

    public function jobOpening(): BelongsTo
    {
        return $this->belongsTo(JobOpening::class);
    }

    public function interviews(): HasMany
    {
        return $this->hasMany(Interview::class);
    }
}
