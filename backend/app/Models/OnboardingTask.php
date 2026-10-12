<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OnboardingTask extends Model
{
    use HasCompany;

    public const STATUSES = ['pending', 'completed', 'skipped'];

    protected $fillable = [
        'company_id',
        'candidate_id',
        'title',
        'description',
        'assignee_id',
        'due_date',
        'status',
        'completed_at',
        'completed_by',
        'link_type',
        'sort_order',
        'reminded_at',
    ];

    protected $casts = [
        'due_date' => 'date',
        'completed_at' => 'datetime',
        'reminded_at' => 'datetime',
        'sort_order' => 'integer',
    ];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id')->select(['id', 'name']);
    }

    public function isDone(): bool
    {
        return in_array($this->status, ['completed', 'skipped'], true);
    }
}
