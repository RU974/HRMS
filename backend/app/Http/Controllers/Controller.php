<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    use AuthorizesRequests;

    protected function ok(mixed $data = null, ?string $message = null, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $status);
    }

    protected function fail(string $message, int $status = 400, mixed $errors = null)
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'errors' => $errors,
        ], $status);
    }

    protected function authorizePermission(Request $request, string $permission, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user();
        if ($user && $user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return;
        }
        $permissions = str_contains($permission, '|') ? explode('|', $permission) : [$permission];
        if (!$user || !$user->hasAnyPermission($permissions)) {
            abort(403, $message);
        }
    }

    protected function authorizeAnyPermission(Request $request, array $permissions, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user();
        if ($user && $user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return;
        }
        if (!$user || !$user->hasAnyPermission($permissions)) {
            abort(403, $message);
        }
    }

    protected function authorizeSelfOrPermission(Request $request, ?int $userId, string $permission, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user();
        if ($user && $user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return;
        }
        if ($user && $user->hasPermission($permission)) {
            return;
        }
        if ($userId !== null && $request->user()?->id === $userId) {
            return;
        }

        abort(403, $message);
    }

    protected function authorizeRoles(Request $request, array $roles, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user()?->loadMissing('roles');
        if (!$user) {
            abort(403, $message);
        }

        if ($user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return;
        }

        if (!$user->hasAnyRole($roles)) {
            abort(403, $message);
        }
    }

    protected function authorizeSelfOrRole(Request $request, ?int $userId, array $roles, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user();
        if ($user && $user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return;
        }
        if ($user && $user->hasAnyRole($roles)) {
            return;
        }

        if ($userId !== null && $request->user()?->id === $userId) {
            return;
        }

        abort(403, $message);
    }

    protected function userIsCompanyAdmin(Request $request): bool
    {
        return (bool) $request->user()?->hasAnyRole([User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN]);
    }

    protected function shouldScopeToManagedEmployees(Request $request): bool
    {
        $user = $request->user();
        if (!$user || $this->userIsCompanyAdmin($request)) {
            return false;
        }

        return $user->can('employees:view')
            || $user->can('employees:export')
            || $user->can('attendance:view')
            || $user->can('attendance:manage_settings')
            || $user->can('attendance:approve')
            || $user->can('leaves:view')
            || $user->can('leaves:manage_settings')
            || $user->can('leaves:approve')
            || $user->can('payroll:view')
            || $user->can('payroll:manage_settings')
            || $user->can('performance:view')
            || $user->can('performance:manage_settings')
            || $user->can('reports:view')
            || $user->can('reports:export')
            || $user->can('reports:manage_settings')
            || $user->can('employees:view');
    }

    protected function applyManagedEmployeeScope(Request $request, $query, ?string $employeeRelation = null): void
    {
        if (!$this->shouldScopeToManagedEmployees($request)) {
            return;
        }

        $user = $request->user();
        $manager = $user?->employee;
        if (!$manager) {
            return;
        }

        $managerId = $manager->id;
        $departmentId = $manager->department_id;
        $branchId = $user->branch_id;

        $query->where(function (Builder $builder) use ($employeeRelation, $managerId, $departmentId, $branchId): void {
            if ($employeeRelation) {
                $builder->whereHas($employeeRelation, function ($employeeQuery) use ($managerId, $departmentId, $branchId): void {
                    $employeeQuery->where('manager_id', $managerId)
                        ->orWhere('id', $managerId);

                    if ($departmentId) {
                        $employeeQuery->orWhere('department_id', $departmentId);
                    }

                    if ($branchId) {
                        $employeeQuery->orWhereHas('user', function ($userQuery) use ($branchId): void {
                            $userQuery->where('branch_id', $branchId);
                        });
                    }
                });

                return;
            }

            $builder->where('manager_id', $managerId)
                ->orWhere('id', $managerId);

            if ($departmentId) {
                $builder->orWhere('department_id', $departmentId);
            }

            if ($branchId) {
                $builder->orWhereHas('user', function ($userQuery) use ($branchId): void {
                    $userQuery->where('branch_id', $branchId);
                });
            }
        });
    }

    protected function isEmployeeWithinManagedScope(Request $request, int $employeeId): bool
    {
        if (!$this->shouldScopeToManagedEmployees($request)) {
            return true;
        }

        $user = $request->user();
        $manager = $user?->employee;
        if (!$manager) {
            return true;
        }

        return Employee::query()
            ->whereKey($employeeId)
            ->where(function ($builder) use ($manager, $user): void {
                $builder->where('id', $manager->id)
                    ->orWhere('manager_id', $manager->id);

                if ($manager->department_id) {
                    $builder->orWhere('department_id', $manager->department_id);
                }

                if ($user->branch_id) {
                    $builder->orWhereHas('user', function ($userQuery) use ($user): void {
                        $userQuery->where('branch_id', $user->branch_id);
                    });
                }
            })
            ->exists();
    }

    protected function authorizeManagedEmployeeAccess(Request $request, int $employeeId, string $context = 'record'): void
    {
        if (!$this->shouldScopeToManagedEmployees($request)) {
            return;
        }

        if ($this->isEmployeeWithinManagedScope($request, $employeeId)) {
            return;
        }

        abort(403, "You are not authorized to access this {$context}.");
    }
}