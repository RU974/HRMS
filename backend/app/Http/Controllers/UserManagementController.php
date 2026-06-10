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

        $users = \App\Models\User::with(['roles.permissions', 'permissions', 'company', 'branch'])
            ->when($request->user()?->company_id, fn ($q) => $q->where('company_id', $request->user()->company_id))
            ->orderBy('name')
            ->get();

        return $this->ok($users);
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'users:create');

        $validated = $request->validate([
            'name'       => 'required|string|max:255',
            'email'      => 'required|email|unique:users,email',
            'username'   => 'nullable|string|max:255|unique:users,username',
            'password'   => 'required|string|min:8',
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id'  => 'nullable|uuid|exists:branches,id',
            'role_ids'   => 'nullable|array',
            'role_ids.*' => 'uuid|exists:roles,id',
        ]);

        // Non-super-admins can only create users in their own company
        if ($request->user()?->company_id) {
            $validated['company_id'] = $request->user()->company_id;
        }

        $user = $this->service->create($validated, $request->user());

        return $this->ok($user, 'User created successfully', 201);
    }

    public function show(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:view');

        $user = \App\Models\User::with(['roles.permissions', 'permissions', 'company', 'branch'])
            ->findOrFail($id);

        if ($request->user()?->company_id && (string) $user->company_id !== (string) $request->user()->company_id) {
            abort(403, 'You are not authorized to view this user.');
        }

        return $this->ok($user);
    }

    public function update(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:edit');

        $user = \App\Models\User::findOrFail($id);

        if ($request->user()?->company_id && (string) $user->company_id !== (string) $request->user()->company_id) {
            abort(403, 'You are not authorized to update this user.');
        }

        $validated = $request->validate([
            'name'       => 'sometimes|required|string|max:255',
            'email'      => 'sometimes|required|email|unique:users,email,' . $id,
            'username'   => 'nullable|string|max:255|unique:users,username,' . $id,
            'password'   => 'nullable|string|min:8',
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id'  => 'nullable|uuid|exists:branches,id',
            'role_ids'   => 'nullable|array',
            'role_ids.*' => 'uuid|exists:roles,id',
        ]);

        $user = $this->service->update($user, $validated, $request->user());

        return $this->ok($user, 'User updated successfully');
    }

    public function destroy(Request $request, string $id)
    {
        $this->authorizePermission($request, 'users:delete');

        $user = \App\Models\User::findOrFail($id);

        if ($request->user()?->company_id && (string) $user->company_id !== (string) $request->user()->company_id) {
            abort(403, 'You are not authorized to delete this user.');
        }

        if ((string) $user->id === (string) $request->user()->id) {
            return $this->fail('You cannot delete your own account.', 422);
        }

        $user->delete();

        return $this->ok(null, 'User deleted successfully');
    }
}