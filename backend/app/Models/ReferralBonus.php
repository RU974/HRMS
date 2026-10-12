<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReferralBonus extends Model
{
    use HasCompany;

    public const STATUSES = ['tracking', 'pending', 'eligible', 'approved', 'paid', 'cancelled'];

    protected $fillable = [
        'company_id', 'candidate_id', 'employee_id', 'agency_id', 'amount', 'currency',
        'status', 'eligible_on', 'paid_on', 'bonus_id', 'decided_by', 'notes',
    ];

    protected $casts = ['amount' => 'decimal:2', 'eligible_on' => 'date', 'paid_on' => 'date'];

    public function candidate(): BelongsTo
    {
        return $this->belongsTo(Candidate::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class)->select(['id', 'name', 'email']);
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(RecruitmentAgency::class, 'agency_id');
    }
}
