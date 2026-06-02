<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Concerns\HasRoles;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    public const ROLE_SUPER_ADMIN = 'Super Admin';
    public const ROLE_COMPANY_ADMIN = 'Company Admin';
    public const ROLE_HR_MANAGER = 'HR Manager';
    public const ROLE_HR_EXECUTIVE = 'HR Executive';
    public const ROLE_DEPARTMENT_MANAGER = 'Department Manager';
    public const ROLE_EMPLOYEE = 'Employee';
    public const ROLE_PAYROLL_MANAGER = 'Payroll Manager';
    public const ROLE_ATTENDANCE_MANAGER = 'Attendance Manager';
    public const ROLE_RECRUITER = 'Recruiter';
    public const ROLE_IT_SUPPORT = 'IT Support';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'email',
        'username',
        'password',
    ];


    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $appends = [
        'role_ids',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'company_id' => 'string',
            'branch_id' => 'string',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

    /**
     * @return array<int, string>
     */
    public function getRoleIdsAttribute(): array
    {
        return $this->roles()->pluck('id')->values()->all();
    }

    public static function availableRoles(): array
    {
        return [
            self::ROLE_SUPER_ADMIN,
            self::ROLE_COMPANY_ADMIN,
            self::ROLE_HR_MANAGER,
            self::ROLE_HR_EXECUTIVE,
            self::ROLE_PAYROLL_MANAGER,
            self::ROLE_ATTENDANCE_MANAGER,
            self::ROLE_RECRUITER,
            self::ROLE_DEPARTMENT_MANAGER,
            self::ROLE_IT_SUPPORT,
            self::ROLE_EMPLOYEE,
        ];
    }
}
