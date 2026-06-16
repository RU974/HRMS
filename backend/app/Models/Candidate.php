<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Candidate extends Model
{
    use HasCompany;

    public const STAGES = [
        'applied',
        'screening',
        'interview',
        'offer',
        'hired',
        'rejected',
    ];

    public const STAGE_TRANSITIONS = [
        'applied' => ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'],
        'screening' => ['screening', 'interview', 'offer', 'hired', 'rejected'],
        'interview' => ['interview', 'offer', 'hired', 'rejected'],
        'offer' => ['offer', 'hired', 'rejected'],
        'hired' => ['hired'],
        'rejected' => ['rejected'],
    ];

    protected $fillable = [
        'job_opening_id',
        'employee_id',
        'company_id',
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
        'offer_letter_data',
        'onboarding_checklist',
    ];

    protected $casts = [
        'applied_at' => 'date',
        'onboarding_start_date' => 'date',
        'offer_letter_data' => 'array',
        'onboarding_checklist' => 'array',
    ];

    protected $appends = [
        'score',
    ];

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

    public function canTransitionTo(string $targetStage): bool
    {
        return in_array($targetStage, self::STAGE_TRANSITIONS[$this->stage] ?? [], true);
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

        $baseScore = $rating ? min(max($rating, 1), 5) * 16 : 0;
        $score = $baseScore + ($passCount * 12) - ($failCount * 8) + ($holdCount * 2);

        return max(0, min(100, $score));
    }

    public function getOfferLetterStructure(): array
    {
        $data = $this->offer_letter_data ?? [];

        return [
            'candidate_name' => $this->full_name,
            'job_title' => $this->jobOpening?->title,
            'offer_date' => $data['offer_date'] ?? now()->toDateString(),
            'start_date' => $data['start_date'] ?? null,
            'salary' => $data['salary'] ?? null,
            'currency' => $data['currency'] ?? null,
            'employment_type' => $this->jobOpening?->employment_type,
            'benefits' => $data['benefits'] ?? [],
            'terms' => $data['terms'] ?? null,
            'additional_notes' => $data['additional_notes'] ?? null,
        ];
    }

    public function getOnboardingChecklistSummary(): array
    {
        $checklist = collect($this->onboarding_checklist ?? []);
        $completed = $checklist->where('completed', true)->count();

        return [
            'count' => $checklist->count(),
            'completed' => $completed,
            'remaining' => max(0, $checklist->count() - $completed),
            'tasks' => $checklist->all(),
        ];
    }
}

