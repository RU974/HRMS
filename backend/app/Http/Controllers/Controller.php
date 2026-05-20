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

    protected function authorizeRoles(Request $request, array $roles, string $message = 'You are not authorized to perform this action.'): void
    {
        $role = $request->user()?->role;
        if (!$role || !in_array($role, $roles, true)) {
            abort(403, $message);
        }
    }

    protected function authorizeSelfOrRole(Request $request, ?int $userId, array $roles, string $message = 'You are not authorized to perform this action.'): void
    {
        if (in_array($request->user()?->role, $roles, true)) {
            return;
        }

        if ($userId !== null && $request->user()?->id === $userId) {
            return;
        }

        abort(403, $message);
    }
}
