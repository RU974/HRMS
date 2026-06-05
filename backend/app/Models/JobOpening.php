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
    ];

    protected $casts = [
        'posted_at' => 'date',
        'closed_at' => 'date',
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function candidates(): HasMany
    {
        return $this->hasMany(Candidate::class);
    }
}
