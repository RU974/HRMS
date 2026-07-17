<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackgroundRun extends Model
{
    public const TYPE_PAYROLL_GENERATE = 'payroll_generate';
    public const TYPE_EMPLOYEE_IMPORT = 'employee_import';
    public const TYPE_EMPLOYEE_EXPORT = 'employee_export';

    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_DONE = 'done';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'type',
        'status',
        'company_id',
        'requested_by',
        'summary',
        'error',
    ];

    protected $casts = [
        'summary' => 'array',
    ];
}
