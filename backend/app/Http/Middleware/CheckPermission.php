<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\Auth;

/**
 * Legacy alias for PermissionMiddleware.
 *
 * NOTE: This class previously lived (erroneously) in
 * app/Http/Controllers/UserManagementController.php with the same
 * namespace, causing the "cannot declare class … already in use" fatal.
 * That file has been replaced with the real UserManagementController.
 *
 * Prefer using the 'permission' middleware alias (PermissionMiddleware)
 * for new routes. This class is kept only for any routes that still
 * reference 'check.permission'.
 */
class CheckPermission
{
    public function handle($request, Closure $next, $permission)
    {
        $user = Auth::user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // Super admin bypass
        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return $next($request);
        }

        // Normalise: treat colon and dot as equivalent
        $normalized = mb_strtolower(trim($permission));

        if (app(\App\Services\PermissionService::class)->hasPermission($user, $normalized)) {
            return $next($request);
        }

        return response()->json(['message' => 'Forbidden'], 403);
        // ↑ Unreachable return below the 403 has been removed.
    }
}