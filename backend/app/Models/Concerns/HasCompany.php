<?php

namespace App\Models\Concerns;

use App\Models\Company;
use App\Models\Scopes\CompanyScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait HasCompany
{
    public static function bootHasCompany(): void
    {
        static::addGlobalScope(new CompanyScope());
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function scopeForCompany(Builder $query, ?int $companyId = null): Builder
    {
        $companyId = $companyId ?? auth()->user()?->company_id;

        if (!$companyId) {
            return $query;
        }

        return $query->where($this->getTable() . '.company_id', $companyId);
    }
}
