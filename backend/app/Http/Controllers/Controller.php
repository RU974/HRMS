<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
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
        if (!$user || !$user->hasPermission($permission)) {
            abort(403, $message);
        }
    }

    protected function authorizeAnyPermission(Request $request, array $permissions, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user();
        if (!$user || !$user->hasAnyPermission($permissions)) {
            abort(403, $message);
        }
    }

    protected function authorizeSelfOrPermission(Request $request, ?int $userId, string $permission, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user();
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
        $user = $request->user()?->loadMissing('rolesRelation');
        if (!$user) {
            abort(403, $message);
        }

        $userRoleNames = $user->rolesRelation->pluck('name')->all();
        if (count(array_intersect($roles, $userRoleNames)) === 0) {
            abort(403, $message);
        }
    }

    protected function authorizeSelfOrRole(Request $request, ?int $userId, array $roles, string $message = 'You are not authorized to perform this action.'): void
    {
        $user = $request->user()?->loadMissing('rolesRelation');
        if ($user) {
            $userRoleNames = $user->rolesRelation->pluck('name')->all();
            if (count(array_intersect($roles, $userRoleNames)) > 0) {
                return;
            }
        }

        if ($userId !== null && $request->user()?->id === $userId) {
            return;
        }

        abort(403, $message);
    }
}
