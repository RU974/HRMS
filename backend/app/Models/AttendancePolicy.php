<?php

namespace App\Models;

use App\Services\AttendancePolicyResolver;
use Illuminate\Database\Eloquent\Model;

class AttendancePolicy extends Model
{
    protected $fillable = [
        'company_id',
        'name',
        'late_after_time',
        'allow_manual_status_override',
    ];

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
}
