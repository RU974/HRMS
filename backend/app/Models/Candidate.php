<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Candidate extends Model
{
    use HasCompany;

    protected $fillable = [
        'job_opening_id',
        'employee_id',
        'company_id',
        'full_name',
        'email',
        'phone',
        'resume_path',
        'resume_original_name',
        'rejection_reason',
        'tags',
        'source',
        'stage',
        'rating',
        'status',
        'applied_at',
        'notes',
        'onboarding_status',
        'onboarding_start_date',
        'onboarding_notes',
        'offer_letter_data',
        'onboarding_checklist',
        'portal_token_hash',
        'portal_token_expires_at',
        'resume_text',
        'resume_parsed',
        'skills',
        'experience_years',
        'phone_normalized',
        'talent_pool',
        'talent_pool_note',
        'talent_pool_added_at',
        'fit_score',
        'fit_breakdown',
        'fit_scored_at',
        'resume_review_reason',
        'merged_from',
        'withdrawn_at',
        'pool_consent',
        'pool_consent_requested_at',
        'pool_consent_at',
        'talent_pool_expires_at',
        'anonymized_at',
        'pipeline_stage_id',
        'source_type',
        'referrer_employee_id',
        'agency_id',
        'knockout_failed',
    ];

    public const SOURCE_TYPES = ['careers', 'referral', 'agency', 'direct', 'import', 'other'];

    public const TALENT_POOLS = ['silver_medalist', 'general'];

    public const POOL_CONSENT = ['unconfirmed', 'pending', 'granted', 'declined'];

    protected $casts = [
        'applied_at' => 'date',
        'onboarding_start_date' => 'date',
        'offer_letter_data' => 'array',
        'onboarding_checklist' => 'array',
        'tags' => 'array',
        'skills' => 'array',
        'resume_parsed' => 'array',
        'experience_years' => 'float',
        'portal_token_expires_at' => 'datetime',
        'talent_pool_added_at' => 'datetime',
        'fit_breakdown' => 'array',
        'fit_scored_at' => 'datetime',
        'merged_from' => 'array',
        'withdrawn_at' => 'datetime',
        'pool_consent_requested_at' => 'datetime',
        'pool_consent_at' => 'datetime',
        'talent_pool_expires_at' => 'datetime',
        'anonymized_at' => 'datetime',
        'knockout_failed' => 'boolean',
    ];

    // The stored path is internal; clients download the file through the authenticated resume endpoint.
    protected $hidden = [
        'resume_path',
        'resume_text',
        'portal_token_hash',
        'portal_token_expires_at',
        'phone_normalized',
    ];

    protected static function booted(): void
    {
        static::saving(function (Candidate $candidate) {
            if ($candidate->isDirty('phone') || ! $candidate->exists) {
                $candidate->phone_normalized = self::normalizePhone($candidate->phone);
            }
        });
    }

    /** Digits only, last ten, so "+92 300-1234567" and "0300 1234567" compare equal. */
    public static function normalizePhone(?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);

        return strlen($digits) >= 7 ? substr($digits, -10) : null;
    }

    protected $appends = [
        'score',
        'has_resume',
    ];

    public function getHasResumeAttribute(): bool
    {
        return filled($this->resume_path);
    }

    public function jobOpening(): BelongsTo
    {
        return $this->belongsTo(JobOpening::class);
    }

    public function interviews(): HasMany
    {
        return $this->hasMany(Interview::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function stageHistories(): HasMany
    {
        return $this->hasMany(CandidateStageHistory::class)->latest('id');
    }

    public function onboardingTasks(): HasMany
    {
        return $this->hasMany(OnboardingTask::class)->orderBy('sort_order')->orderBy('id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(CandidateMessage::class)->orderBy('id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CandidateDocument::class)->orderBy('id');
    }

    public function pipelineStage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class);
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'referrer_employee_id')->select(['id', 'name', 'email']);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(RecruitmentAgency::class, 'agency_id');
    }

    public function answers(): HasMany
    {
        return $this->hasMany(CandidateAnswer::class)->orderBy('id');
    }

    public function checks(): HasMany
    {
        return $this->hasMany(CandidateCheck::class)->orderBy('id');
    }

    public function referralBonus(): HasOne
    {
        return $this->hasOne(ReferralBonus::class);
    }

    public function offers(): HasMany
    {
        return $this->hasMany(Offer::class)->latest('id');
    }

    /** Named candidateNotes (not notes) so the relation never shadows the free-text notes column in JSON. */
    public function candidateNotes(): HasMany
    {
        return $this->hasMany(CandidateNote::class)->latest('id');
    }

    public function getScoreAttribute(): ?int
    {
        $rating = $this->rating ? (int) $this->rating : null;
        $interviews = $this->relationLoaded('interviews')
            ? $this->interviews
            : $this->interviews()->get();

        $passCount = $interviews->where('result', 'pass')->count();
        $failCount = $interviews->where('result', 'fail')->count();
        $holdCount = $interviews->where('result', 'hold')->count();

        if ($rating === null && $passCount === 0 && $failCount === 0 && $holdCount === 0) {
            return null;
        }

        // Unrated candidates start from a neutral 3-star base so interview results
        // adjust the score instead of being measured against zero.
        $baseScore = min(max($rating ?? 3, 1), 5) * 16;
        $score = $baseScore + ($passCount * 12) - ($failCount * 8) + ($holdCount * 2);

        return max(0, min(100, $score));
    }
}
