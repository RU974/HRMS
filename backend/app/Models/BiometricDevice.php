<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class BiometricDevice extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'branch_id',
        'connection_type',
        'ip_address',
        'port',
        'comm_key',
        'device_model',
        'api_endpoint',
        'api_key',
        'sync_mode',
        'sync_interval_minutes',
        'timezone',
        'status',
        'last_sync_at',
        'stale_alerted_at',
        'monitor_sync',
        'company_id',
    ];

    protected $hidden = [
        'agent_token_hash',
    ];

    protected $casts = [
        'last_sync_at' => 'datetime',
        'stale_alerted_at' => 'datetime',
        'monitor_sync' => 'boolean',
        'port' => 'integer',
        'sync_interval_minutes' => 'integer',
    ];

    /**
     * Generate a new per-device agent token, persist its hash, and return the
     * plaintext once. The plaintext is never stored or retrievable again —
     * callers must surface it to the admin immediately.
     */
    public function rotateAgentToken(): string
    {
        $plain = Str::random(48);
        $this->agent_token_hash = Hash::make($plain);
        $this->save();

        return $plain;
    }

    public function hasAgentToken(): bool
    {
        return !empty($this->agent_token_hash);
    }

    public function verifyAgentToken(?string $plain): bool
    {
        if (!$this->hasAgentToken()) {
            return false;
        }

        return $plain !== null && $plain !== '' && Hash::check($plain, $this->agent_token_hash);
    }

    /**
     * Silence longer than this means the device or agent has stopped syncing: the company's
     * policy value when set, else three missed intervals (at least 3 hours).
     */
    public function staleAfterMinutes(): int
    {
        $custom = AttendancePolicy::forCompany($this->company_id ? (string) $this->company_id : null)?->device_stale_minutes;

        return $custom ? (int) $custom : max(180, 3 * (int) ($this->sync_interval_minutes ?: 60));
    }

    public function isStale(): bool
    {
        if (!$this->monitor_sync) {
            return false;
        }
        $since = $this->last_sync_at ?? $this->created_at;

        return $since !== null && $since->lt(now()->subMinutes($this->staleAfterMinutes()));
    }

    public function syncLogs()
    {
        return $this->hasMany(BiometricSyncLog::class, 'device_id');
    }

    public function mappings()
    {
        return $this->hasMany(EmployeeDeviceMapping::class, 'device_id');
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class, 'biometric_device_id');
    }

    public function company()
    {
        return $this->belongsTo(\App\Models\Company::class, 'company_id', 'id');
    }
}