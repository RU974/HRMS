<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollProcessing extends Model
{
    protected $fillable = [
        'company_id',   // ← added for multi-tenant isolation
        'month',
        'year',
        'status',
        'processed_at',
        'notes',
    ];

    protected $casts = [
        'month'        => 'integer',
        'year'         => 'integer',
        'processed_at' => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    // ── Query scopes ──────────────────────────────────────────────

    /**
     * Scope to a specific company.
     * Pass null to retrieve global / unscoped records (super-admin use).
     */
    public function scopeForCompany(Builder $query, ?string $companyId): Builder
    {
        if ($companyId === null) {
            return $query;
        }

        return $query->where('company_id', $companyId);
    }
}