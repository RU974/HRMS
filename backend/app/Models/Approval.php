<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Approval extends Model
{
    use HasFactory;

    protected $fillable = [
        'module', 'module_id', 'workflow_id', 'current_step_id', 'status',
        'requested_by', 'company_id', 'metadata',
        'approved_at', 'rejected_at', 'escalated_at', 'due_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'escalated_at' => 'datetime',
        'due_at' => 'datetime',
    ];

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(Workflow::class);
    }

    public function currentStep(): BelongsTo
    {
        return $this->belongsTo(ApprovalStep::class, 'current_step_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(ApprovalResponse::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
