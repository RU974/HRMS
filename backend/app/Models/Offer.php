<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Offer extends Model
{
    use HasCompany;

    public const STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted', 'declined', 'expired', 'withdrawn'];

    /** Statuses in which an offer still counts as "the" offer for its candidate. */
    public const ACTIVE_STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'accepted'];

    /** Statuses in which the terms may still be edited. */
    public const EDITABLE_STATUSES = ['draft', 'rejected'];

    public const APPROVAL_MODULE = 'recruitment_offer';

    protected $fillable = [
        'company_id',
        'candidate_id',
        'created_by',
        'salary',
        'currency',
        'start_date',
        'expires_at',
        'benefits',
        'terms',
        'additional_notes',
        'status',
        'approval_id',
        'approval_note',
        'sent_at',
        'responded_at',
        'decline_reason',
        'responded_via',
        'response_name',
        'response_ip',
        'sign_code_hash',
        'sign_code_expires_at',
        'sign_code_attempts',
        'document_hash',
        'signature_record',
    ];

    protected $casts = [
        'salary' => 'decimal:2',
        'start_date' => 'date',
        'expires_at' => 'date',
        'benefits' => 'array',
        'sent_at' => 'datetime',
        'responded_at' => 'datetime',
        'sign_code_expires_at' => 'datetime',
        'signature_record' => 'array',
    ];

    protected $hidden = ['sign_code_hash', 'sign_code_expires_at', 'sign_code_attempts'];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->select(['id', 'name']);
    }

    public function approval(): BelongsTo
    {
        return $this->belongsTo(Approval::class);
    }

    public function isEditable(): bool
    {
        return in_array($this->status, self::EDITABLE_STATUSES, true);
    }
}
