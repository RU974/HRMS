<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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

    protected $casts = [
        'last_sync_at' => 'datetime',
        'port' => 'integer',
        'sync_interval_minutes' => 'integer',
    ];

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