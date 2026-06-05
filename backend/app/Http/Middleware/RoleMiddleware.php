<?php

namespace App\Http\Middleware;

use Closure;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        if (!$user) {
            abort(403, 'You are not authorized to perform this action.');
        }

        if ($user->hasAnyRole([User::ROLE_SUPER_ADMIN])) {
            return $next($request);
        }

        if (!$user->hasAnyRole($roles)) {
            abort(403, 'You are not authorized to perform this action.');
        }

        return $next($request);
    }
}
