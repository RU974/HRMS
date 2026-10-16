<?php

namespace App\Models;

use App\Services\AttendancePolicyResolver;
use Illuminate\Database\Eloquent\Model;

class AttendancePolicy extends Model
{
    /** Editable rule columns (everything except ownership / name). */
    public const RULE_FIELDS = [
        'late_after_time',
        'allow_manual_status_override',
        'early_leave_enabled',
        'early_leave_grace_minutes',
        'early_leave_before_time',
        'early_leave_counts_as_late',
        'full_day_hours',
        'half_day_hours',
        'count_short_as_absent',
        'half_day_after_late_minutes',
        'absent_after_late_minutes',
        'lates_per_absent',
        'auto_mark_absent',
        'missing_punch_as_absent',
    ];

    protected $fillable = [
        'company_id',
        'name',
        ...self::RULE_FIELDS,
    ];

    protected $casts = [
        'allow_manual_status_override' => 'boolean',
        'early_leave_enabled' => 'boolean',
        'early_leave_grace_minutes' => 'integer',
        'early_leave_counts_as_late' => 'boolean',
        'full_day_hours' => 'float',
        'half_day_hours' => 'float',
        'count_short_as_absent' => 'boolean',
        'half_day_after_late_minutes' => 'integer',
        'absent_after_late_minutes' => 'integer',
        'lates_per_absent' => 'integer',
        'auto_mark_absent' => 'boolean',
        'missing_punch_as_absent' => 'boolean',
    ];

    /** What a company gets when neither it nor the global default has a row. */
    public static function defaults(): array
    {
        return [
            'late_after_time' => '09:15:00',
            'allow_manual_status_override' => true,
            'early_leave_enabled' => false,
            'early_leave_grace_minutes' => 0,
            'early_leave_before_time' => null,
            'early_leave_counts_as_late' => false,
            'full_day_hours' => null,
            'half_day_hours' => null,
            'count_short_as_absent' => false,
            'half_day_after_late_minutes' => null,
            'absent_after_late_minutes' => null,
            'lates_per_absent' => 0,
            'auto_mark_absent' => true,
            'missing_punch_as_absent' => false,
        ];
    }

    /** The policy in force for a company: its own, else the global default. */
    public static function forCompany(?string $companyId): ?self
    {
        return app(AttendancePolicyResolver::class)->forCompany($companyId);
    }

    /** Policy for the company an employee belongs to. */
    public static function forEmployee(?Employee $employee): ?self
    {
        return static::forCompany($employee?->company_id ? (string) $employee->company_id : null);
    }

    /** Does a stored policy exist for this company (as opposed to inheriting the default)? */
    public static function ownedBy(?string $companyId): bool
    {
        return $companyId !== null && static::query()->where('company_id', $companyId)->exists();
    }
}
