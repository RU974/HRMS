<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalStepApprover extends Model
{
    protected $fillable = [
        'approval_step_id',
        'approver_type',
        'approver_identifier',
    ];

    public function step(): BelongsTo
    {
        return $this->belongsTo(ApprovalStep::class, 'approval_step_id');
    }
}
