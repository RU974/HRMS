<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    protected $table = 'audit_logs';

    protected $fillable = [
        'user_id',
        'method',
        'user_role',
        'action',
        'module',
        'company_id',
        'ip_address',
        'old_value',
        'new_value',
        'immutable',
    ];

    protected $casts = [
        'old_value' => 'array',
        'new_value' => 'array',
        'immutable' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::updating(function () {
            throw new \LogicException('Audit logs are immutable.');
        });

        static::deleting(function () {
            throw new \LogicException('Audit logs are immutable.');
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
