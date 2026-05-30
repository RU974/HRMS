<?php

namespace App\Http\Controllers;

use App\Services\UserManagementService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserManagementController extends Controller
{
    public function __construct(private readonly UserManagementService $service)
    {
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'manage users');
        $q = \App\Models\User::query()->with(['roles.permissions', 'permissions']);
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $q->where(function ($w) use ($search) {
                $w->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%");
            });
        }
        return $this->ok($q->orderBy('name')->get());
    }

    public function show(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage users');
        return $this->ok(\App\Models\User::with(['roles.permissions', 'permissions'])->findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizePermission($request, 'manage users');
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8',
            'role_ids' => 'required|array|min:1',
            'role_ids.*' => [
                'required',
                'uuid',
                Rule::exists('roles', 'id')->where(function ($query) use ($request) {
                    $query->whereNull('company_id');
                    if ($request->user()?->company_id) {
                        $query->orWhere('company_id', $request->user()?->company_id);
                    }
                }),
            ],
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id' => 'nullable|uuid|exists:branches,id',
        ]);

        $user = $this->service->create($validated, $request->user());
        return $this->ok($user, 'User created successfully', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage users');
        $user = \App\Models\User::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role_ids' => 'sometimes|required|array|min:1',
            'role_ids.*' => [
                'required',
                'uuid',
                Rule::exists('roles', 'id')->where(function ($query) use ($request) {
                    $query->whereNull('company_id');
                    if ($request->user()?->company_id) {
                        $query->orWhere('company_id', $request->user()?->company_id);
                    }
                }),
            ],
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id' => 'nullable|uuid|exists:branches,id',
        ]);

        return $this->ok($this->service->update($user, $validated, $request->user()), 'User updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage users');
        $user = \App\Models\User::findOrFail($id);
        if ($request->user()?->id === $user->id) {
            return $this->fail('You cannot delete your own account.', 422);
        }
        $user->delete();
        return $this->ok(null, 'User deleted successfully');
    }
}
