<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CandidateDocument extends Model
{
    use HasCompany;

    /** requested: staff asked for it; uploaded: waiting for review; verified/rejected: reviewed. */
    public const STATUSES = ['requested', 'uploaded', 'verified', 'rejected'];

    protected $fillable = [
        'company_id',
        'candidate_id',
        'label',
        'status',
        'file_path',
        'original_name',
        'mime_type',
        'size',
        'uploaded_by_type',
        'requested_by',
        'reviewed_by',
        'review_note',
        'uploaded_at',
    ];

    protected $casts = [
        'uploaded_at' => 'datetime',
        'size' => 'integer',
    ];

    // The storage path is internal; files are downloaded through authenticated endpoints.
    protected $hidden = ['file_path'];

    protected $appends = ['has_file'];

    public function getHasFileAttribute(): bool
    {
        return filled($this->file_path);
    }

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by')->select(['id', 'name']);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by')->select(['id', 'name']);
    }
}
