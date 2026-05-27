<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserRoleController extends Controller
{
    public function __construct(private readonly PermissionService $permissionService)
    {
    }

    public function getUserRoles(Request $request, int $id)
    {
        $user = User::with('rolesRelation.permissions')->findOrFail($id);

        return $this->ok($user->rolesRelation);
    }

    public function updateUserRoles(Request $request, int $id)
    {
        $validated = $request->validate([
            'roles' => 'required|array|min:1',
            'roles.*.role_id' => 'required|exists:roles,id',
            'roles.*.scope' => 'nullable|array',
        ]);

        $user = User::findOrFail($id);

        $payload = collect($validated['roles'])->mapWithKeys(function (array $item) {
            return [
                $item['role_id'] => [
                    'scope' => json_encode($item['scope'] ?? new \stdClass()),
                ],
            ];
        })->toArray();

        DB::transaction(function () use ($user, $payload) {
            $user->rolesRelation()->sync($payload);
        });

        $this->permissionService->flushUserPermissionCache($user);

        return $this->ok($user->fresh('rolesRelation.permissions')->rolesRelation, 'User roles updated successfully');
    }
}
