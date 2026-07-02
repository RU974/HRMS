<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

use App\Models\Shift;

class Employee extends Model
{
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
        'address',
        'emergency_contacts',
        'employee_number',
        'joining_date',
        'employment_type',
        'shift_id',
        'manager_id',
        'basic_salary',
        'allowances',
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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
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
