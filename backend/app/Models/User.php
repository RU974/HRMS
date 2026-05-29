<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

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
        'role',
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

    protected ?string $legacyRoleName = null;

    protected static function booted(): void
    {
        static::created(function (self $user): void {
            $user->syncLegacyRoleAssignment();
        });
    }

    public function setRoleAttribute(?string $value): void
    {
        $this->legacyRoleName = $value !== null ? trim($value) : null;
    }

    private function syncLegacyRoleAssignment(): void
    {
        if (!$this->legacyRoleName) {
            return;
        }

        $role = null;
        if ($this->company_id) {
            $role = Role::query()
                ->where('name', $this->legacyRoleName)
                ->where('company_id', $this->company_id)
                ->first();
        }

        if (!$role) {
            $role = Role::query()
                ->where('name', $this->legacyRoleName)
                ->whereNull('company_id')
                ->first();
        }

        if (!$role) {
            return;
        }

        $this->rolesRelation()->syncWithoutDetaching([
            $role->id => ['scope' => json_encode(new \stdClass())],
        ]);

        $this->loadMissing('rolesRelation.permissions');
    }

    public function rolesRelation(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')
            ->using(UserRole::class)
            ->withPivot('scope')
            ->withTimestamps();
    }

    public static function roles(): array
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

    public function hasPermission(string $permissionKey): bool
    {
        return app(\App\Services\PermissionService::class)->hasPermission($this, $permissionKey);
    }

    public function hasAnyPermission(array $permissionKeys): bool
    {
        foreach ($permissionKeys as $permissionKey) {
            if ($this->hasPermission($permissionKey)) {
                return true;
            }
        }

        return false;
    }

    public function getRoleAttribute(): ?string
    {
        $this->loadMissing('rolesRelation');
        return $this->rolesRelation->pluck('name')->first();
    }
}
