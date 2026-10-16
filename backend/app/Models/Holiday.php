<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use HasCompany;

    protected static function booted(): void
    {
        // Leave rows follow the holiday calendar: a new holiday is not a leave day, a removed one is.
        $resync = function (Holiday $holiday): void {
            if (!$holiday->is_optional && $holiday->company_id) {
                app(\App\Services\LeaveAttendanceSync::class)
                    ->syncCompanyDate((string) $holiday->company_id, $holiday->holiday_date->toDateString());
            }
        };
        static::saved($resync);
        static::deleted($resync);
    }

    protected $fillable = [
        'company_id',
        'name',
        'holiday_date',
        'is_optional',
    ];

    protected $casts = [
        'holiday_date' => 'date',
        'is_optional' => 'boolean',
    ];
}
