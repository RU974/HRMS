<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class License extends Model
{
    use HasUuids;

    protected $keyType   = 'string';
    public    $incrementing = false;

    protected $fillable = [
        'company_id',
        'license_key',
        'product',
        'edition',
        'licensee_name',
        'licensee_email',
        'max_employees',
        'max_users',
        'status',
        'issued_at',
        'expires_at',
        'activated_at',
        'issued_by',
        'support_email',
        'features',
        'metadata',
        'currency',
        'is_active',
    ];

    protected $casts = [
        'features'     => 'array',
        'metadata'     => 'array',
        'is_active'    => 'boolean',
        'issued_at'    => 'datetime',
        'expires_at'   => 'datetime',
        'activated_at' => 'datetime',
        'max_employees'=> 'integer',
        'max_users'    => 'integer',
    ];

    protected $appends = ['days_remaining'];

    // ─── Relationships ────────────────────────────────────────────────────────

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    // ─── Accessors ────────────────────────────────────────────────────────────

    /**
     * How many calendar days remain before the license expires.
     * Returns null when there is no expiry date (perpetual).
     */
    public function getDaysRemainingAttribute(): ?int
    {
        if (! $this->expires_at) {
            return null;
        }

        $diff = (int) now()->startOfDay()->diffInDays($this->expires_at->startOfDay(), false);

        return max(0, $diff);
    }

    // ─── Status helpers ───────────────────────────────────────────────────────

    /**
     * Valid state-machine transitions:
     *
     *   trial ──(activate)──────────────────────► active
     *   trial ──(N days, no activation)──────────► expired   [licenses:expire-trials command]
     *   active ──(expires_at past)───────────────► expired   [usage() / allCompanyUsage() checks]
     *   active ──(suspend)───────────────────────► suspended [LicenseService::suspend()]
     *   suspended ──(unsuspend)──────────────────► active | expired  [recalculateStatus()]
     *   any ──(revoke / DELETE)──────────────────► is_active = false  [permanent; cannot re-activate]
     *
     * is_active = false is a terminal state. activate() rejects these keys outright.
     *
     * Recalculate and set status based on current timestamps.
     * Called after activation and on any update that touches expires_at or activated_at.
     */
    public function recalculateStatus(): void
    {
        if ($this->status === 'suspended') {
            return; // Suspended stays suspended until explicitly lifted
        }

        if ($this->expires_at && $this->expires_at->isPast()) {
            $this->status = 'expired';
        } elseif ($this->activated_at) {
            $this->status = 'active';
        } else {
            $this->status = 'trial';
        }
    }

    // ─── Key generation ───────────────────────────────────────────────────────

    /**
     * Generate a unique, human-readable license key.
     * Format: HRMS-XXXXX-XXXXX-XXXXX-XXXXX
     */
    public static function generateKey(): string
    {
        do {
            $segments = [];
            for ($i = 0; $i < 4; $i++) {
                $segments[] = strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
            }
            $key = 'HRMS-' . implode('-', $segments);
        } while (static::where('license_key', $key)->exists());

        return $key;
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeForCompany($query, ?string $companyId)
    {
        if ($companyId) {
            $query->where('company_id', $companyId);
        }
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}