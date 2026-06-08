<?php

namespace App\Http\Controllers;

use App\Models\Branch;
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
        $q = \App\Models\User::query()->with(['company', 'branch', 'roles.permissions', 'permissions']);
        $this->applyCompanyScope($request, $q);
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
        $user = \App\Models\User::with(['company', 'branch', 'roles.permissions', 'permissions'])->findOrFail($id);
        $this->assertCompanyAccess($request, $user);

        return $this->ok($user);
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
                'integer',
                Rule::exists('roles', 'id')->where(function ($query) use ($request) {
                    $query->whereNull('company_id');
                    if ($request->user()?->company_id) {
                        $query->orWhere('company_id', $request->user()?->company_id);
                    }
                }),
            ],
            'company_id' => 'nullable|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
        ]);

        $this->normalizeCompanyPayload($request, $validated);
        $this->assertBranchMatchesCompany($validated);

        $user = $this->service->create($validated, $request->user());
        return $this->ok($user, 'User created successfully', 201);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage users');
        $user = \App\Models\User::findOrFail($id);
        $this->assertCompanyAccess($request, $user);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'role_ids' => 'sometimes|required|array|min:1',
            'role_ids.*' => [
                'required',
                'integer',
                Rule::exists('roles', 'id')->where(function ($query) use ($request) {
                    $query->whereNull('company_id');
                    if ($request->user()?->company_id) {
                        $query->orWhere('company_id', $request->user()?->company_id);
                    }
                }),
            ],
            'company_id' => 'nullable|exists:companies,id',
            'branch_id' => 'nullable|exists:branches,id',
        ]);

        $this->normalizeCompanyPayload($request, $validated, $user->company_id);
        $this->assertBranchMatchesCompany($validated, $user->company_id);

        return $this->ok($this->service->update($user, $validated, $request->user()), 'User updated successfully');
    }

    public function destroy(Request $request, int $id)
    {
        $this->authorizePermission($request, 'manage users');
        $user = \App\Models\User::findOrFail($id);
        $this->assertCompanyAccess($request, $user);
        if ($request->user()?->id === $user->id) {
            return $this->fail('You cannot delete your own account.', 422);
        }
        $user->delete();
        return $this->ok(null, 'User deleted successfully');
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function assertBranchMatchesCompany(array $validated, ?string $fallbackCompanyId = null): void
    {
        if (empty($validated['branch_id'])) {
            return;
        }

        $companyId = $validated['company_id'] ?? $fallbackCompanyId ?? null;
        if (!$companyId) {
            abort(422, 'Select a company before assigning a branch.');
        }

        $branchExists = Branch::query()
            ->whereKey($validated['branch_id'])
            ->where('company_id', $companyId)
            ->exists();

        if (!$branchExists) {
            abort(422, 'Selected branch does not belong to the selected company.');
        }
    }

    private function applyCompanyScope(Request $request, \Illuminate\Database\Eloquent\Builder $query): void
    {
        $companyId = $request->user()?->company_id;
        if ($companyId) {
            $query->where('company_id', $companyId);
        }
    }

    private function assertCompanyAccess(Request $request, \App\Models\User $targetUser): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if ((string) ($targetUser->company_id ?? '') !== (string) $companyId) {
            abort(403, 'You are not authorized to access this user.');
        }
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function normalizeCompanyPayload(Request $request, array &$validated, ?string $fallbackCompanyId = null): void
    {
        $companyId = $request->user()?->company_id;
        if (!$companyId) {
            return;
        }

        if (!empty($validated['company_id']) && (string) $validated['company_id'] !== (string) $companyId) {
            abort(403, 'You are not authorized to assign users outside your company.');
        }

        if ($fallbackCompanyId !== null && (string) $fallbackCompanyId !== (string) $companyId) {
            abort(403, 'You are not authorized to modify users outside your company.');
        }

        $validated['company_id'] = $companyId;
    }
}