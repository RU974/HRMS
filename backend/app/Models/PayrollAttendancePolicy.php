<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How attendance turns into lost pay for one company. A company with no row of its own
 * gets the config/payroll.php defaults.
 */
class PayrollAttendancePolicy extends Model
{
    protected $fillable = [
        'company_id',
        'enabled',
        'absent_deduction_days',
        'half_day_deduction_days',
        'lates_per_deduction',
        'late_deduction_days',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'absent_deduction_days' => 'float',
        'half_day_deduction_days' => 'float',
        'lates_per_deduction' => 'integer',
        'late_deduction_days' => 'float',
    ];

    /** @return array{enabled: bool, absent_deduction_days: float, half_day_deduction_days: float, lates_per_deduction: int, late_deduction_days: float} */
    public static function settingsFor(?string $companyId): array
    {
        $defaults = [
            'enabled' => (bool) config('payroll.attendance.enabled', true),
            'absent_deduction_days' => (float) config('payroll.attendance.absent_deduction_days', 1),
            'half_day_deduction_days' => (float) config('payroll.attendance.half_day_deduction_days', 0.5),
            'lates_per_deduction' => (int) config('payroll.attendance.lates_per_deduction', 3),
            'late_deduction_days' => (float) config('payroll.attendance.late_deduction_days', 1),
        ];

        $row = $companyId ? static::query()->where('company_id', $companyId)->first() : null;

        return $row
            ? array_merge($defaults, $row->only(array_keys($defaults)))
            : $defaults;
    }
}
