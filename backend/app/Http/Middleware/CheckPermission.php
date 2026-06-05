<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\Auth;

class CheckPermission
{
    public function handle($request, Closure $next, $permission)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // super admin bypass
        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return $next($request);
        }

        // check roles -> permissions relationship
        $has = $user->roles()->whereHas('permissions', function($q) use ($permission) {
            $q->where('name', $permission);
        })->exists();

        if (! $has) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
