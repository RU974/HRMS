<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class CandidateBulkRun extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id', 'user_id', 'action', 'params', 'filters', 'exclude_ids', 'status',
        'total', 'processed', 'succeeded_count', 'failed', 'finished_at',
    ];

    protected $casts = [
        'params' => 'array',
        'filters' => 'array',
        'exclude_ids' => 'array',
        'failed' => 'array',
        'finished_at' => 'datetime',
    ];
}
