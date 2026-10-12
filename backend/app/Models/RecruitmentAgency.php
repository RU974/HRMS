<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RecruitmentAgency extends Model
{
    use HasCompany;

    protected $fillable = ['company_id', 'name', 'contact_name', 'email', 'phone', 'fee_percent', 'terms', 'is_active'];

    protected $casts = ['fee_percent' => 'decimal:2', 'is_active' => 'boolean'];

    public function candidates(): HasMany
    {
        return $this->hasMany(Candidate::class, 'agency_id');
    }
}
