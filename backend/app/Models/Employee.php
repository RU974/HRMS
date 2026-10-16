<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

use App\Models\Shift;

class Employee extends Model
{
    protected static function booted(): void
    {
        // A new default shift or department (grace) changes the schedule from today on; days that
        // already happened keep the shift they were recorded with. Joining date moves which leave days count.
        static::updated(function (Employee $employee): void {
            if ($employee->wasChanged(['shift_id', 'department_id'])) {
                // The refresh re-syncs the employee's leave as well.
                app(\App\Services\ShiftAttendanceSync::class)->refresh([(int) $employee->id], \Carbon\Carbon::today());
            } elseif ($employee->wasChanged('joining_date')) {
                app(\App\Services\LeaveAttendanceSync::class)->syncEmployee($employee);
            }
        });
    }

    protected $fillable = [
        'user_id',
        'company_id',
        'name',
        'email',
        'phone',
        'first_name',
        'last_name',
        'cnic',
        'date_of_birth',
        'gender',
        'blood_group',
        'address',
        'emergency_contacts',
        'employee_number',
        'joining_date',
        'employment_type',
        'shift_id',
        'manager_id',
        'basic_salary',
        'allowances',
        'commission_percentage',
        'salary_grade_id',
        'profile_image',
        'department_id',
        'designation_id',
        'designation',
        'salary',
        'status',
    ];

    protected $casts = [
        'emergency_contacts' => 'array',
    ];

    public function getProfileImageAttribute($value): ?string
    {
        return $value ? Storage::disk('public')->url($value) : null;
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function salaryGrade(): BelongsTo
    {
        return $this->belongsTo(SalaryGrade::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function bankAccount(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(EmployeeBankAccount::class);
    }

    public function designationRef(): BelongsTo
    {
        return $this->belongsTo(Designation::class, 'designation_id');
    }

    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    /**
     * The employee's shift with grace_minutes resolved for their department.
     * Returns an in-memory copy; never persist it.
     */
    public function effectiveShift(): ?Shift
    {
        $shift = $this->shift;
        if (!$shift) {
            return null;
        }

        if (!$shift->relationLoaded('departmentGraces')) {
            $shift->load('departmentGraces');
        }
        $effective = clone $shift;
        $effective->grace_minutes = $shift->graceMinutesFor($this->department_id ? (int) $this->department_id : null);

        return $effective;
    }

    /** What this employee is scheduled to do on a date: roster, rotation, swap or override first, else their default shift. */
    public function scheduleOn(\Carbon\CarbonInterface|string $date): \App\Services\ScheduledShift
    {
        return app(\App\Services\ShiftResolver::class)->on($this, $date);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    public function promotions(): HasMany
    {
        return $this->hasMany(EmployeePromotion::class);
    }
}
