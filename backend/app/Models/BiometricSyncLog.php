<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BiometricSyncLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'device_id',
        'started_at',
        'finished_at',
        'records_fetched',
        'records_matched',
        'records_unmatched',
        'records_locked',
        'status',
        'error_message',
        'company_id',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'records_fetched' => 'integer',
        'records_matched' => 'integer',
        'records_unmatched' => 'integer',
        'records_locked' => 'integer',
    ];

    public function device()
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }
}