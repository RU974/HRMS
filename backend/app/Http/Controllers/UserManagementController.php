<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\UserManagementService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserManagementController extends Controller
{
    private const ADMIN_ROLES = [User::ROLE_SUPER_ADMIN, User::ROLE_COMPANY_ADMIN, User::ROLE_HR_MANAGER];

    public function __construct(private readonly UserManagementService $service)
    {
    }

    public function index(Request $request)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        $q = User::query()->with('rolesRelation');
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
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        return $this->ok(User::with('rolesRelation')->findOrFail($id));
    }

    public function store(Request $request)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8',
            'role' => ['required', 'string', Rule::in(User::roles())],
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id' => 'nullable|uuid|exists:branches,id',
        ]);

        $user = $this->service->create($validated);
        return $this->ok($user, 'User created successfully', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        $user = User::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role' => ['sometimes', 'required', 'string', Rule::in(User::roles())],
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id' => 'nullable|uuid|exists:branches,id',
        ]);

        return $this->ok($this->service->update($user, $validated), 'User updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizeRoles($request, self::ADMIN_ROLES);
        $user = User::findOrFail($id);
        if ($request->user()?->id === $user->id) {
            return $this->fail('You cannot delete your own account.', 422);
        }
        $user->delete();
        return $this->ok(null, 'User deleted successfully');
    }
}
