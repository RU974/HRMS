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
        'company_id',
    ];

    protected $hidden = [
        'agent_token_hash',
    ];

    protected $casts = [
        'last_sync_at' => 'datetime',
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