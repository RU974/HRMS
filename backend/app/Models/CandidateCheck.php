<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CandidateCheck extends Model
{
    use HasCompany;

    public const TYPES = ['reference', 'background', 'assessment'];

    public const STATUSES = ['requested', 'in_progress', 'passed', 'failed', 'waived'];

    /** Statuses that count as "dealt with" when a hire is gated on checks. */
    public const CLEARED = ['passed', 'waived'];

    protected $fillable = [
        'company_id', 'candidate_id', 'type', 'title', 'status', 'provider', 'contact_name', 'contact_email',
        'contact_phone', 'relationship', 'due_on', 'score', 'max_score', 'pass_mark', 'result_notes', 'response',
        'response_token_hash', 'response_token_expires_at', 'document_id', 'requested_by', 'completed_by',
        'requested_at', 'completed_at', 'waive_reason',
    ];

    protected $casts = [
        'due_on' => 'date',
        'score' => 'decimal:2',
        'max_score' => 'decimal:2',
        'pass_mark' => 'decimal:2',
        'response' => 'array',
        'response_token_expires_at' => 'datetime',
        'requested_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    protected $hidden = ['response_token_hash', 'response_token_expires_at'];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(CandidateDocument::class, 'document_id');
    }
}
