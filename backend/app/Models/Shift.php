<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Shift extends Model
{
    use HasCompany;

    protected $fillable = [
        'company_id',
        'name',
        'start_time',
        'end_time',
        'continues_after_midnight',
        'working_days',
        'grace_minutes',
        'is_active',
    ];

    protected $casts = [
        'is_active'    => 'boolean',
        'continues_after_midnight' => 'boolean',
        'working_days' => 'array',
    ];

    public function departmentGraces(): HasMany
    {
        return $this->hasMany(ShiftDepartmentGrace::class);
    }

    /**
     * Grace period for a department, falling back to the shift's default
     * grace_minutes when the department has no override.
     */
    public function graceMinutesFor(?int $departmentId): int
    {
        if ($departmentId) {
            $override = $this->departmentGraces
                ->firstWhere('department_id', $departmentId);
            if ($override) {
                return (int) $override->grace_minutes;
            }
        }

        return (int) ($this->grace_minutes ?? 0);
    }
}
