<?php

namespace App\Http\Middleware;

use App\Services\PermissionService;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PermissionMiddleware
{
    public function __construct(private readonly PermissionService $permissionService)
    {
    }

    public function handle(Request $request, Closure $next, string $requiredPermission): Response
    {
        $user = $request->user();

        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        if ($user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return $next($request);
        }

        $requiredPermissions = array_map('trim', explode('|', $requiredPermission));

        if (!$user->can($requiredPermissions)) {
            abort(403, 'You do not have the required permission: ' . $requiredPermission);
        }

        return $next($request);
    }
}
