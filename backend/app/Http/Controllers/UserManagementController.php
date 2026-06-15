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

        // ── License seat check ───────────────────────────────────────────────
        // Enforce max_users limit for company-scoped users. Super Admin is exempt.
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $license = \App\Models\License::query()
                ->where('company_id', $companyId)
                ->where('is_active', true)
                ->whereIn('status', ['active', 'trial'])
                ->orderByDesc('activated_at')
                ->orderByDesc('created_at')
                ->first();

            if ($license && $license->max_users > 0) {
                $currentCount = \App\Models\User::where('company_id', $companyId)->count();

                if ($currentCount >= $license->max_users) {
                    return response()->json([
                        'success' => false,
                        'message' => "User seat limit reached. Your {$license->edition} license allows a maximum of {$license->max_users} users. Please upgrade your license or remove an existing user.",
                    ], 422);
                }
            }
        }
        // ────────────────────────────────────────────────────────────────────

        $validated = $request->validate([
            'name'       => 'required|string|max:255',
            'email'      => 'required|email|unique:users,email',
            'username'   => 'nullable|string|max:255|unique:users,username',
            'password'   => 'required|string|min:8',
            'company_id' => 'nullable|uuid|exists:companies,id',
            'branch_id'  => 'nullable|uuid|exists:branches,id',
            'role_ids'   => 'nullable|array',
            'role_ids.*' => 'integer|exists:roles,id',
            'is_active'  => 'nullable|boolean',
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
            'role_ids.*' => 'integer|exists:roles,id',
            'is_active'  => 'nullable|boolean',
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