<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BiometricDeviceCommand extends Model
{
    public const TYPE_ADD_USER = 'add_user';
    public const TYPE_REMOVE_USER = 'remove_user';

    protected $fillable = [
        'device_id',
        'company_id',
        'type',
        'device_user_id',
        'payload',
        'status',
        'result_message',
        'requested_by',
        'sent_at',
        'completed_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'sent_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function device()
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }
}
