<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CandidateMessage extends Model
{
    use HasCompany;

    public const FROM_CANDIDATE = 'candidate';

    public const FROM_STAFF = 'staff';

    protected $fillable = ['company_id', 'candidate_id', 'direction', 'user_id', 'body', 'read_at'];

    protected $casts = ['read_at' => 'datetime'];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id')->select(['id', 'name']);
    }
}
