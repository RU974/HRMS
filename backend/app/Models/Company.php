<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    use HasFactory, HasUuids;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'website',
        'address',
        'timezone',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function licenses(): HasMany
    {
        return $this->hasMany(License::class);
    }

    // ─── Licensing helpers ────────────────────────────────────────────────────

    /**
     * The current active (non-revoked) license for this company.
     * Returns null when no license exists — callers treat null as "no limit enforced".
     */
    public function activeLicense(): ?License
    {
        return License::query()
            ->forCompany($this->id)
            ->active()
            ->orderByDesc('created_at')
            ->first();
    }

    /**
     * Count of employees with status='active' scoped strictly to this company.
     * Never counts across tenants — always filters by company_id on the employees table.
     */
    public function activeEmployeeCount(): int
    {
        return Employee::where('company_id', $this->id)
            ->where('status', 'active')
            ->count();
    }

    /**
     * Returns true when the company has consumed its licensed employee seats.
     * Always returns false (unlimited) when no license exists or max_employees is null.
     */
    public function hasReachedEmployeeLimit(): bool
    {
        $limit = $this->activeLicense()?->max_employees;

        if ($limit === null) {
            return false;
        }

        return $this->activeEmployeeCount() >= $limit;
    }
}
