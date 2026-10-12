<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobOpening extends Model
{
    use HasCompany;

    protected $fillable = [
        'title',
        'department_id',
        'company_id',
        'employment_type',
        'location',
        'description',
        'status',
        'open_positions',
        'posted_at',
        'closed_at',
        'hiring_manager_id',
        'recruiter_id',
        'salary_min',
        'salary_max',
        'salary_currency',
        'requirements',
        'is_public',
        'requested_by',
        'approval_id',
        'approval_note',
        'justification',
        'submitted_at',
        'estimated_cost',
        'budget_check',
        'required_checks',
        'auto_reject_knockouts',
        'referral_bonus_amount',
    ];

    protected $casts = [
        'posted_at' => 'date',
        'closed_at' => 'date',
        'is_public' => 'boolean',
        'submitted_at' => 'datetime',
        'salary_min' => 'decimal:2',
        'salary_max' => 'decimal:2',
        'estimated_cost' => 'decimal:2',
        'budget_check' => 'array',
        'required_checks' => 'array',
        'auto_reject_knockouts' => 'boolean',
        'referral_bonus_amount' => 'decimal:2',
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function hiringManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'hiring_manager_id')->select(['id', 'name']);
    }

    public function recruiter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recruiter_id')->select(['id', 'name']);
    }

    public const STATUSES = ['open', 'closed', 'on_hold', 'pending_approval', 'rejected'];

    /** Statuses a job can be edited and (re)submitted from while it is still a requisition. */
    public const EDITABLE_REQUISITION_STATUSES = ['rejected'];

    public const APPROVAL_MODULE = 'recruitment_job_requisition';

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by')->select(['id', 'name']);
    }

    public function approval(): BelongsTo
    {
        return $this->belongsTo(Approval::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(JobQuestion::class)->orderBy('sort_order')->orderBy('id');
    }

    public function pipelineStages(): HasMany
    {
        return $this->hasMany(PipelineStage::class)->orderBy('sort_order')->orderBy('id');
    }

    public function candidates(): HasMany
    {
        return $this->hasMany(Candidate::class);
    }
}
