<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;

class UserManagementService
{
    public function __construct(private readonly PermissionService $permissionService)
    {
    }

    public function create(array $data, ?User $actor = null): User
    {
        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);
        $departmentId = $data['department_id'] ?? null;
        $designation = $data['designation'] ?? null;
        unset($data['department_id'], $data['designation']);
        $data['password'] = Hash::make($data['password']);
        $data['must_change_password'] = true;
        $user = User::create($data);
        $this->syncAssignableRoles($user, $roleIds, $actor);
        $this->syncEmployeeProfile($user, $departmentId, $designation);

        return $user->fresh(['company', 'branch', 'roles.permissions', 'permissions', 'employee.department']);
    }

    public function update(User $user, array $data, ?User $actor = null): User
    {
        $roleIds = $data['role_ids'] ?? null;
        unset($data['role_ids']);
        $departmentId = array_key_exists('department_id', $data) ? $data['department_id'] : null;
        $designation = $data['designation'] ?? null;
        unset($data['department_id'], $data['designation']);
        if (isset($data['password']) && $data['password']) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);
        if (is_array($roleIds)) {
            $this->syncAssignableRoles($user, $roleIds, $actor);
        }
        if ($departmentId) {
            $this->syncEmployeeProfile($user, $departmentId, $designation);
        } elseif ($user->employee) {
            // Keep an existing employee profile's name/email/company in step with the user record.
            $this->syncEmployeeProfile($user, $user->employee->department_id, $user->employee->designation);
        }

        return $user->fresh(['company', 'branch', 'roles.permissions', 'permissions', 'employee.department']);
    }

    /**
     * Every company user with a department is, by definition, staff of that
     * company — so they must show up in the Employees list, not just User
     * Management. Creates the linked Employee record on first assignment,
     * or keeps it in sync with the user's current name/email/company/status
     * on later saves.
     */
    private function syncEmployeeProfile(User $user, ?string $departmentId, ?string $designation): void
    {
        if (!$departmentId || !$user->company_id) {
            return;
        }

        $employee = $user->employee ?? Employee::where('user_id', $user->id)->first();

        $attributes = [
            'company_id'    => $user->company_id,
            'name'          => $user->name,
            'email'         => $user->email,
            'department_id' => $departmentId,
            'designation'   => $designation ?: ($employee->designation ?? ''),
        ];

        if ($employee) {
            $employee->update($attributes);
            return;
        }

        Employee::create(array_merge($attributes, ['user_id' => $user->id, 'status' => 'active']));
    }

    private function syncAssignableRoles(User $user, array $roleIds, ?User $actor): void
    {
        // Cast every incoming value to int — handles strings like "1", "2" from JSON
        $requestedRoleIds = collect($roleIds)
            ->filter(fn ($id) => filled($id) && is_numeric($id))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        if (empty($requestedRoleIds)) {
            return;
        }

        $validRoleIds = $this->resolveAssignableRoleIds($requestedRoleIds, $actor);

        if (empty($validRoleIds)) {
            abort(422, 'None of the selected roles could be assigned.');
        }

        $user->syncRoles($validRoleIds);
        $this->permissionService->flushUserPermissionCache($user);
    }

    private function resolveAssignableRoleIds(array $roleIds, ?User $actor): array
    {
        if (!$actor || (!$actor->can('settings:manage_settings') && !$actor->can('users:edit') && !$actor->can('users:assign'))) {
            abort(403, 'You are not authorized to assign roles.');
        }

        return Role::query()
            ->whereIn('id', $roleIds)
            ->where(function ($query) use ($actor) {
                $query->whereNull('company_id');
                if ($actor?->company_id) {
                    $query->orWhere('company_id', $actor->company_id);
                }
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}