<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CandidateNote extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id',
        'candidate_id',
        'user_id',
        'body',
    ];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id')->select(['id', 'name']);
    }
}
