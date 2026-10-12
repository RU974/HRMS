<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OnboardingTemplateTask extends Model
{
    public const ASSIGNEE_TYPES = ['unassigned', 'user', 'hiring_manager', 'recruiter', 'new_hire'];

    public const LINK_TYPES = ['none', 'inventory', 'document'];

    protected $fillable = [
        'onboarding_template_id',
        'title',
        'description',
        'assignee_type',
        'assignee_user_id',
        'due_offset_days',
        'link_type',
        'sort_order',
    ];

    protected $casts = [
        'due_offset_days' => 'integer',
        'sort_order' => 'integer',
    ];

    public function template(): BelongsTo
    {
        return $this->belongsTo(OnboardingTemplate::class, 'onboarding_template_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_user_id')->select(['id', 'name']);
    }
}
