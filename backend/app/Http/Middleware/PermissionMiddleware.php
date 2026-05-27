<?php

namespace App\Http\Middleware;

use App\Services\PermissionService;
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

        if (!$this->permissionService->hasPermission($user, $requiredPermission)) {
            abort(403, 'You do not have the required permission: ' . $requiredPermission);
        }

        return $next($request);
    }
}
