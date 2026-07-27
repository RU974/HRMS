<?php

namespace App\Http\Controllers;

use App\Services\UserManagementService;
use Illuminate\Http\Request;

class UserManagementController extends Controller
{
    public function __construct(private readonly UserManagementService $service)
    {
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'users:view');

        $query = \App\Models\User::query()->with(['roles.permissions', 'permissions', 'company', 'branch', 'employee.department'])->orderBy('name');
        $this->scopeToCompany($request, $query);
        $users = $query->get();

        return $this->ok($users);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'users:create');

        if (
            ! $request->user()?->hasAnyRole([\App\Models\User::ROLE_SUPER_ADMIN]) &&
            ! app(\App\Services\LicenseService::class)->canAddUser($request->user()?->company_id)
        ) {
            return response()->json([
                'message' => 'User seat limit reached. Upgrade your license to add more users.',
            ], 403);
        }

        $validated = $request->validate([
            'name'          => 'required|string|max:255',
            'email'         => 'required|email|unique:users,email',
            'username'      => 'nullable|string|max:255|unique:users,username',
            'password'      => 'required|string|min:8',
            'company_id'    => 'nullable|uuid|exists:companies,id',
            'branch_id'     => 'nullable|uuid|exists:branches,id',
            'role_ids'      => 'nullable|array',
            'role_ids.*'    => 'integer|exists:roles,id',
            'is_active'     => 'nullable|boolean',
            'department_id' => 'nullable|exists:departments,id',
            'designation'   => 'nullable|string|max:255',
        ]);

        // Non-super-admins can only create users in their own company
        if ($request->user()?->company_id) {
            $validated['company_id'] = $request->user()->company_id;
        }

        // Assigning a department turns this user into an employee (visible in the
        // Employees list), so it must respect the same seat cap as Add Employee.
        if (!empty($validated['department_id']) && !empty($validated['company_id'])) {
            try {
                app(\App\Services\LicenseService::class)->assertCanAddEmployee($validated['company_id']);
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        $user = $this->service->create($validated, $request->user());

        return $this->ok($user, 'User created successfully', 201);
    }

    public function show(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:view');

        $query = \App\Models\User::query()->with(['roles.permissions', 'permissions', 'company', 'branch', 'employee.department']);
        $this->scopeToCompany($request, $query);
        $user  = $query->findOrFail($id);

        return $this->ok($user);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:edit');

        $query = \App\Models\User::query();
        $this->scopeToCompany($request, $query);
        $user  = $query->findOrFail($id);

        $validated = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'email'         => 'sometimes|required|email|unique:users,email,' . $id,
            'username'      => 'nullable|string|max:255|unique:users,username,' . $id,
            'password'      => 'nullable|string|min:8',
            'company_id'    => 'nullable|uuid|exists:companies,id',
            'branch_id'     => 'nullable|uuid|exists:branches,id',
            'role_ids'      => 'nullable|array',
            'role_ids.*'    => 'integer|exists:roles,id',
            'is_active'     => 'nullable|boolean',
            'department_id' => 'nullable|exists:departments,id',
            'designation'   => 'nullable|string|max:255',
        ]);

        // Only charge a seat when this assignment newly turns the user into an
        // employee; editing an already-linked employee's department is free.
        $companyId = $validated['company_id'] ?? $user->company_id;
        if (!empty($validated['department_id']) && $companyId && !$user->loadMissing('employee')->employee) {
            try {
                app(\App\Services\LicenseService::class)->assertCanAddEmployee($companyId);
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        $user = $this->service->update($user, $validated, $request->user());

        return $this->ok($user, 'User updated successfully');
    }

    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:delete');

        $query = \App\Models\User::query();
        $this->scopeToCompany($request, $query);
        $user  = $query->findOrFail($id);

        if ((string) $user->id === (string) $request->user()->id) {
            return $this->fail('You cannot delete your own account.', 422);
        }

        $user->delete();

        return $this->ok(null, 'User deleted successfully');
    }
}